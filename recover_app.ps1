$logPath = "C:\Users\jabustos\.gemini\antigravity\brain\1f762293-5b50-427a-9efa-6b142c755ec4\.system_generated\logs\overview.txt"
$outPath = "c:\Users\jabustos\Desktop\App\app_recovered.js"
$lines = Get-Content -Path $logPath -Encoding UTF8

$recovered = @{}
$inFile = $false

foreach ($line in $lines) {
    if ($line -match 'File Path: `file:///c:/Users/jabustos/Desktop/App/app.js`') {
        $inFile = $true
        continue
    }
    if ($inFile -and (($line -match 'The above content does NOT show') -or ($line -match 'The above content shows the entire'))) {
        $inFile = $false
        continue
    }
    if ($inFile) {
        if ($line -match '^(\d+): (.*)$') {
            $num = [int]$matches[1]
            $content = $matches[2]
            # Always overwrite so later views update earlier ones
            $recovered[$num] = $content
        }
    }
}

$max = 0
foreach ($k in $recovered.Keys) {
    if ($k -gt $max) { $max = $k }
}

$output = @()
for ($i = 1; $i -le $max; $i++) {
    if ($recovered.ContainsKey($i)) {
        $output += $recovered[$i]
    } else {
        $output += ""
    }
}

$output | Out-File -FilePath $outPath -Encoding UTF8
Write-Host "Recovered $($recovered.Count) lines to $outPath"
