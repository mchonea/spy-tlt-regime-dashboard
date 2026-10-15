# update-market-data.ps1   (replaces update-tlt-data.ps1)
# Pulls FRED series (full history -> history\<ID>.csv, last 5 years -> market-data.js)
# and dividend-adjusted prices for SPY, TLT, XLY, XLP, ^GSPC (history\<T>.csv).
#
# Keys (never written to any file or log):
#   FRED_API_KEY   Windows Credential Manager (generic credential)   -> FRED
#   TIINGO_API_KEY Windows Credential Manager (optional fallback)    -> prices
# Every run appends to update-log.txt (capped at 500 lines).
#
# Switches:
#   -EnsureKey   Prompt for + store FRED_API_KEY if Credential Manager has none, then exit.
#
# Exit codes: 0 ok, 1 nothing downloaded (existing files untouched), 2 partial failure.

param([switch]$EnsureKey)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root    = $PSScriptRoot
$histDir = Join-Path $root 'history'
$outFile = Join-Path $root 'market-data.js'
$logFile = Join-Path $root 'update-log.txt'
$ua      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
$inv     = [Globalization.CultureInfo]::InvariantCulture

# FRED series (keep in sync with config.js)
$series = 'DGS30','DGS20','DGS10','DGS2','DFII10','T10YIE','DFF','UNRATE','PAYEMS',
          'BAMLH0A0HYM2','T10Y3M','SAHMREALTIME','ICSA','NFCI','BAA10Y','VIXCLS','USREC'
# Series that go to market-data.js (USREC is backtest-only but cheap and used for chart shading)
$tickers = 'SPY','TLT','XLY','XLP','^GSPC'
$windowYears = 5     # 3-year display window + 2 years of look-back needed by the indicators

function Log([string]$msg, [string]$color = 'Gray') {
    Write-Host $msg -ForegroundColor $color
    Add-Content -Path $logFile -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
}

if (-not ('TltCredMan' -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TltCredMan {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public int Flags; public int Type; public string TargetName; public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
        public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
    }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWrite(ref CREDENTIAL cred, int flags);
    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr cred);

    public static string Read(string target) {
        IntPtr p;
        if (!CredRead(target, 1, 0, out p)) return null;
        try {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            if (c.CredentialBlobSize == 0) return "";
            return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2);
        } finally { CredFree(p); }
    }
    public static void Write(string target, string user, string secret) {
        byte[] b = Encoding.Unicode.GetBytes(secret);
        CREDENTIAL c = new CREDENTIAL();
        c.Type = 1; c.TargetName = target; c.UserName = user; c.Persist = 2;
        c.CredentialBlobSize = b.Length; c.CredentialBlob = Marshal.AllocHGlobal(b.Length);
        try {
            Marshal.Copy(b, 0, c.CredentialBlob, b.Length);
            if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        } finally { Marshal.FreeHGlobal(c.CredentialBlob); }
    }
}
"@
}

function Read-Cred([string]$target) {
    try { $v = [TltCredMan]::Read($target) } catch { $v = $null }
    if ($v) { return $v.Trim() }
    return $null
}

# ---------------------------------------------------------------- -EnsureKey mode
if ($EnsureKey) {
    if (Read-Cred 'FRED_API_KEY') {
        Write-Host 'FRED_API_KEY already stored in Credential Manager.' -ForegroundColor Green
        exit 0
    }
    Write-Host 'No FRED_API_KEY found in Windows Credential Manager.' -ForegroundColor Yellow
    Write-Host 'Get a free key at https://fredaccount.stlouisfed.org/apikeys'
    $sec = Read-Host 'Paste your FRED API key (input hidden)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $plain = "$plain".Trim()
    if (-not $plain) { Write-Host 'No key entered.' -ForegroundColor Red; exit 1 }
    [TltCredMan]::Write('FRED_API_KEY', $env:USERNAME, $plain)
    Write-Host 'Stored FRED_API_KEY in Credential Manager.' -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------- helpers
if (-not (Test-Path $histDir)) { New-Item -ItemType Directory -Path $histDir | Out-Null }

# Key lookup order (spec 11.1.3): environment variable -> Credential Manager -> fallback. Names only are logged.
$fredKey = $null; $tiingoKey = $null; $fredKeySrc = 'none'; $tiingoKeySrc = 'none'
if ($env:FRED_API_KEY)   { $fredKey = $env:FRED_API_KEY.Trim();     $fredKeySrc = 'environment' }
else { $fredKey = Read-Cred 'FRED_API_KEY'; if ($fredKey) { $fredKeySrc = 'Credential Manager' } }
if ($env:TIINGO_API_KEY) { $tiingoKey = $env:TIINGO_API_KEY.Trim(); $tiingoKeySrc = 'environment' }
else { $tiingoKey = Read-Cred 'TIINGO_API_KEY'; if ($tiingoKey) { $tiingoKeySrc = 'Credential Manager' } }
$curl      = Get-Command curl.exe -ErrorAction SilentlyContinue

function Mask([string]$s) {
    foreach ($k in @($fredKey, $tiingoKey)) {
        if ($k) { $s = $s -replace [regex]::Escape($k), '***' }
    }
    return $s
}

# Download a URL to a string. curl is preferred (more reliable TLS/headers than IWR on 5.1).
function Get-Text([string]$url) {
    if ($curl) {
        $tmp = [IO.Path]::GetTempFileName()
        try {
            # PS 5.1 turns native stderr into terminating errors under 'Stop'; relax it for curl
            $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            $out = & curl.exe -sS -L --fail --connect-timeout 20 --max-time 120 -A $ua -o $tmp $url 2>&1
            $code = $LASTEXITCODE
            $ErrorActionPreference = $prev
            if ($code -ne 0) { throw ("curl exit {0}: {1}" -f $code, ($out -join ' ')) }
            return [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
        } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
    }
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -UserAgent $ua -TimeoutSec 120
    $c = $resp.Content
    if ($c -is [byte[]]) { $c = [Text.Encoding]::UTF8.GetString($c) }
    return $c
}

# FRED -> list of @(date, valueString), full history
function Get-FredRows([string]$id) {
    if ($env:MARKET_FORCE_FAIL -and (($env:MARKET_FORCE_FAIL -split ',') -contains $id)) { throw 'forced failure (MARKET_FORCE_FAIL test hook)' }
    $rows = New-Object System.Collections.Generic.List[object]
    if ($fredKey) {
        $url  = "https://api.stlouisfed.org/fred/series/observations?series_id=$id&api_key=$fredKey&file_type=json"
        $text = Get-Text $url
        $rx = [regex]'"date":\s*"(\d{4}-\d{2}-\d{2})",\s*"value":\s*"(-?\d+(?:\.\d+)?)"'
        foreach ($m in $rx.Matches($text)) { $rows.Add(@($m.Groups[1].Value, $m.Groups[2].Value)) }
    } else {
        $url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=$id"
        foreach ($line in ((Get-Text $url) -split "\r?\n" | Select-Object -Skip 1)) {
            $f = $line.Split(',')
            if ($f.Count -ge 2 -and $f[1].Trim() -match '^-?\d+(\.\d+)?$') { $rows.Add(@($f[0].Trim(), $f[1].Trim())) }
        }
    }
    if ($rows.Count -lt 2) { throw 'no usable observations returned' }
    return ,$rows
}

# Prices -> list of @(date, close, adjclose)
function Get-YahooRows([string]$t) {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $enc = [Uri]::EscapeDataString($t)
    $url = "https://query1.finance.yahoo.com/v8/finance/chart/${enc}?period1=0&period2=$now&interval=1d&events=div,split"
    $j = (Get-Text $url) | ConvertFrom-Json
    $res = $j.chart.result[0]
    if (-not $res) { throw 'Yahoo returned no result' }
    $off = [int]$res.meta.gmtoffset
    $ts  = $res.timestamp
    $cl  = $res.indicators.quote[0].close
    $adj = $null
    if ($res.indicators.PSObject.Properties.Name -contains 'adjclose') { $adj = $res.indicators.adjclose[0].adjclose }
    $rows = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $ts.Count; $i++) {
        if ($null -eq $cl[$i]) { continue }
        $c = [double]$cl[$i]
        $a = $c
        if ($adj -and $null -ne $adj[$i]) { $a = [double]$adj[$i] }
        $d = ([DateTime]'1970-01-01').AddSeconds([double]$ts[$i] + $off).ToString('yyyy-MM-dd')
        $rows.Add(@($d, $c.ToString('0.####', $inv), $a.ToString('0.#####', $inv)))
    }
    if ($rows.Count -lt 100) { throw 'too few price rows' }
    # Yahoo can emit a duplicate last-day row while the market is open; keep the last per date
    $seen = @{}; $out = New-Object System.Collections.Generic.List[object]
    for ($i = $rows.Count - 1; $i -ge 0; $i--) { if (-not $seen.ContainsKey($rows[$i][0])) { $seen[$rows[$i][0]] = 1; $out.Insert(0, $rows[$i]) } }
    return ,$out
}

function Get-StooqRows([string]$t) {
    $s = $t.TrimStart('^').ToLower()
    $text = Get-Text "https://stooq.com/q/d/l/?s=$s.us&i=d"
    if ($text -notmatch '^Date,Open') { throw 'Stooq did not return CSV (bot check?)' }
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($line in ($text -split "\r?\n" | Select-Object -Skip 1)) {
        $f = $line.Split(',')
        if ($f.Count -ge 5 -and $f[4] -match '^-?\d') { $rows.Add(@($f[0], $f[4], $f[4])) }   # Stooq closes are NOT dividend-adjusted
    }
    if ($rows.Count -lt 100) { throw 'too few Stooq rows' }
    return ,$rows
}

function Get-TiingoRows([string]$t) {
    if (-not $tiingoKey) { throw 'no TIINGO_API_KEY (environment or Credential Manager)' }
    $sym = $t.TrimStart('^')
    $j = (Get-Text "https://api.tiingo.com/tiingo/daily/$sym/prices?startDate=1970-01-01&token=$tiingoKey") | ConvertFrom-Json
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($r in $j) {
        $rows.Add(@(([string]$r.date).Substring(0,10), ([double]$r.close).ToString('0.####', $inv), ([double]$r.adjClose).ToString('0.#####', $inv)))
    }
    if ($rows.Count -lt 100) { throw 'too few Tiingo rows' }
    return ,$rows
}

function Read-HistCsv([string]$name) {
    $p = Join-Path $histDir ($name + '.csv')
    if (-not (Test-Path $p)) { return $null }
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($line in (Get-Content $p | Select-Object -Skip 1)) {
        $f = $line.Split(',')
        if ($f.Count -ge 2) { $rows.Add($f) }
    }
    if ($rows.Count -lt 2) { return $null }
    return ,$rows
}

function Write-HistCsv([string]$name, $rows, [string]$header) {
    $p  = Join-Path $histDir ($name + '.csv')
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine($header)
    foreach ($r in $rows) { [void]$sb.AppendLine(($r -join ',')) }
    [IO.File]::WriteAllText($p, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
}

# Fallback: pull one series out of the previous market-data.js (used only if no history CSV exists)
$prevData = $null
if (Test-Path $outFile) {
    try {
        $txt = [IO.File]::ReadAllText($outFile)
        $txt = $txt -replace '^\s*window\.MARKET_DATA\s*=\s*', '' -replace ';\s*$', ''
        $prevData = $txt | ConvertFrom-Json
    } catch { $prevData = $null }
}

# ---------------------------------------------------------------- run
Log '---- run start ----'
if ($fredKey) { Log "FRED source: official API (FRED key: $fredKeySrc)" 'Cyan' }
else          { Log 'FRED source: public CSV (FRED key: none; run Setup Market Schedule.bat or set the FRED_API_KEY secret)' 'Yellow' }
Log "Tiingo key: $tiingoKeySrc"

$fredData  = [ordered]@{}   # id -> rows
$priceData = [ordered]@{}   # ticker -> rows
$failed    = New-Object System.Collections.Generic.List[string]
$downloaded = 0
$priceSource = ''

foreach ($id in $series) {
    $ok = $false
    for ($try = 1; $try -le 3 -and -not $ok; $try++) {
        try {
            $rows = Get-FredRows $id
            $fredData[$id] = $rows
            Write-HistCsv $id $rows 'date,value'
            Log ("OK    {0,-14} {1,6} observations  {2} -> {3}" -f $id, $rows.Count, $rows[0][0], $rows[$rows.Count-1][0]) 'Green'
            $ok = $true; $downloaded++
        } catch {
            $msg = Mask $_.Exception.Message
            if ($try -lt 3) { Log ("retry {0,-14} attempt {1}: {2}" -f $id, $try, $msg) 'DarkYellow'; Start-Sleep -Seconds (3 * $try) }
            else            { Log ("FAIL  {0,-14} {1}" -f $id, $msg) 'Red' }
        }
    }
    if (-not $ok) {
        $failed.Add($id)
        $old = Read-HistCsv $id
        if ($old) { $fredData[$id] = $old; Log ("      {0,-14} carried forward {1} rows from history\{0}.csv" -f $id, $old.Count) 'Yellow' }
        elseif ($prevData -and $prevData.series.PSObject.Properties.Name -contains $id) {
            $r = New-Object System.Collections.Generic.List[object]
            foreach ($p in $prevData.series.$id) { $r.Add(@([string]$p[0], [string]$p[1])) }
            $fredData[$id] = $r
            Log ("      {0,-14} carried forward {1} rows from previous market-data.js" -f $id, $r.Count) 'Yellow'
        }
    }
    Start-Sleep -Milliseconds 400
}

foreach ($t in $tickers) {
    $fileName = $t.TrimStart('^')
    $ok = $false
    foreach ($src in 'Yahoo','Stooq','Tiingo') {
        if ($ok) { break }
        if ($src -eq 'Stooq' -and $t -eq '^GSPC') { continue }
        for ($try = 1; $try -le 3 -and -not $ok; $try++) {
            try {
                if     ($src -eq 'Yahoo')  { $rows = Get-YahooRows $t }
                elseif ($src -eq 'Stooq')  { $rows = Get-StooqRows $t }
                else                       { $rows = Get-TiingoRows $t }
                $priceData[$fileName] = $rows
                Write-HistCsv $fileName $rows 'date,close,adjclose'
                Log ("OK    {0,-14} {1,6} rows  {2} -> {3}  [{4}]" -f $t, $rows.Count, $rows[0][0], $rows[$rows.Count-1][0], $src) 'Green'
                if ($priceSource -notmatch $src) { $priceSource = (($priceSource, $src) -join ',').Trim(',') }
                $ok = $true; $downloaded++
            } catch {
                $msg = Mask $_.Exception.Message
                if ($try -lt 3 -and $src -ne 'Stooq') { Log ("retry {0,-14} {1} attempt {2}: {3}" -f $t, $src, $try, $msg) 'DarkYellow'; Start-Sleep -Seconds (3 * $try) }
                else { Log ("      {0,-14} {1} failed: {2}" -f $t, $src, $msg) 'DarkYellow'; break }
            }
        }
    }
    if (-not $ok) {
        $failed.Add($fileName)
        Log ("FAIL  {0,-14} no price source worked" -f $t) 'Red'
        $old = Read-HistCsv $fileName
        if ($old) {
            $r = New-Object System.Collections.Generic.List[object]
            foreach ($f in $old) { $r.Add(@($f[0], $f[1], $f[2])) }
            $priceData[$fileName] = $r
            Log ("      {0,-14} carried forward {1} rows from history\{0}.csv" -f $fileName, $r.Count) 'Yellow'
        } elseif ($prevData -and $prevData.prices -and ($prevData.prices.PSObject.Properties.Name -contains $fileName)) {
            $r = New-Object System.Collections.Generic.List[object]
            foreach ($p in $prevData.prices.$fileName) { $r.Add(@([string]$p[0], [string]$p[1], [string]$p[1])) }
            $priceData[$fileName] = $r
            Log ("      {0,-14} carried forward {1} rows from previous market-data.js" -f $fileName, $r.Count) 'Yellow'
        }
    }
    Start-Sleep -Milliseconds 400
}
if (-not $priceSource -and $prevData -and $prevData.priceSource) { $priceSource = [string]$prevData.priceSource }

if ($downloaded -eq 0) {
    Log 'Nothing downloaded. Existing market-data.js and history left unchanged.' 'Red'
    exit 1
}

# ---------------------------------------------------------------- market-data.js
$cut = (Get-Date).AddYears(-$windowYears).ToString('yyyy-MM-dd')
$sb = New-Object System.Text.StringBuilder
$gen = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$failedJson = ($failed | ForEach-Object { '"' + $_ + '"' }) -join ','
[void]$sb.Append('window.MARKET_DATA = {"generated":"' + $gen + '","failed":[' + $failedJson + '],"priceSource":"' + $priceSource + '","windowYears":' + $windowYears + ',"series":{')
$first = $true
foreach ($id in $fredData.Keys) {
    $parts = foreach ($r in $fredData[$id]) { if ($r[0] -ge $cut) { '["{0}",{1}]' -f $r[0], $r[1] } }
    if (-not $first) { [void]$sb.Append(',') }; $first = $false
    [void]$sb.Append('"' + $id + '":[' + ($parts -join ',') + ']')
}
[void]$sb.Append('},"prices":{')
$first = $true
foreach ($t in $priceData.Keys) {
    $parts = foreach ($r in $priceData[$t]) { if ($r[0] -ge $cut) { '["{0}",{1}]' -f $r[0], $r[2] } }
    if (-not $first) { [void]$sb.Append(',') }; $first = $false
    [void]$sb.Append('"' + $t + '":[' + ($parts -join ',') + ']')
}
[void]$sb.Append('}};')
[IO.File]::WriteAllText($outFile, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))

Log ("Wrote market-data.js ({0}/{1} FRED series, {2}/{3} price series; price source: {4})." -f ($fredData.Count - ($failed | Where-Object { $series -contains $_ }).Count), $series.Count, $priceData.Count, $tickers.Count, $priceSource) 'Cyan'
if ($failed.Count -gt 0) { Log ("Failed: " + ($failed -join ', ')) 'Red' }

# Keep the log to the last 500 lines
$lines = Get-Content $logFile
if ($lines.Count -gt 500) { $lines | Select-Object -Last 500 | Set-Content $logFile }

if ($failed.Count -gt 0) { exit 2 }
exit 0
