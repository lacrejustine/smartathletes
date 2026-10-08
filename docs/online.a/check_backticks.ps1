$content = Get-Content admin.js -Raw
$balance = 0
$line = 1
for ($i = 0; $i -lt $content.Length; $i++) {
    $c = $content[$i]
    if ($c -eq '`') {
        if ($content[$i+1] -ne '`') {
            # Not an escaped backtick
            if ($balance % 2 -eq 0) {
                Write-Host "OPEN at line $line"
            } else {
                Write-Host "CLOSE at line $line"
            }
        }
    }
    if ($content[$i] -eq "`r") { $line++; $char = 0 }
    elseif ($content[$i] -eq "`n") { $line++; $char = 0 }
}