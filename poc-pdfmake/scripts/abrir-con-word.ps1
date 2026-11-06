# Abre con Word cada documento de una carpeta y dice si lo acepta, con su número
# de párrafos, tablas e índices. Es la única comprobación que demuestra que el
# fichero no está roto: las ocho de scripts/sanear-docx.js garantizan que no se
# publica un dato y que la estructura no se mueve, pero un XML bien formado y con
# las etiquetas en su sitio puede seguir siendo inválido para Word. Así pasó: un
# `<w:t>` colgado de un `<w:tabs>` y cinco documentos que no abrían con las ocho
# comprobaciones en verde.
#
#     pwsh scripts/abrir-con-word.ps1 [carpeta]
#
# Por omisión mira out/saneado/. Pásale docs/entrada_ej/2026-27 para comparar con
# los originales: los recuentos de un saneado tienen que coincidir con los del
# documento del que sale.
#
# Necesita Word instalado, así que es de Windows y no entra en `npm test`.

param([string]$Carpeta = "$PSScriptRoot\..\out\saneado")

$ErrorActionPreference = 'Continue'
$ficheros = Get-ChildItem (Join-Path $Carpeta '*.docx') -ErrorAction SilentlyContinue
if (-not $ficheros) { Write-Output "No hay ningún .docx en $Carpeta"; exit 2 }

$word = $null
$fallos = 0
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  foreach ($f in $ficheros) {
    $doc = $null
    try {
      # Sin conversiones y en solo lectura: no se toca el fichero.
      $doc = $word.Documents.Open($f.FullName, $false, $true)
      Write-Output ("ABRE    parrafos={0,6} tablas={1,4} indices={2}  {3}" -f `
        $doc.Paragraphs.Count, $doc.Tables.Count, $doc.TablesOfContents.Count, $f.Name)
    } catch {
      $fallos += 1
      Write-Output ("FALLA   {0}  ::  {1}" -f $f.Name, $_.Exception.Message.Split("`n")[0])
    } finally {
      if ($doc) { try { $doc.Close(0) } catch {} }
    }
  }
} finally {
  if ($word) {
    try { $word.Quit(0) } catch {}
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}

Write-Output ''
Write-Output ("{0} de {1} abren" -f ($ficheros.Count - $fallos), $ficheros.Count)
exit ([int]($fallos -gt 0))
