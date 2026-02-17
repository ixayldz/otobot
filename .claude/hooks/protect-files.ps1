param([string]$TargetPath)
if ($TargetPath -match "\.env|secrets|\.pem|\.key|id_rsa") {
  Write-Error "Protected path blocked: $TargetPath"
  exit 1
}
exit 0
