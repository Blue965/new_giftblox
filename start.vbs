' Un seul process : bot + API ensemble (main.js).
' Deux process separes chacun chargent la base sql.js en memoire et
' s'ecrasent mutuellement a chaque sauvegarde : donnees corrompues.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -WindowStyle Hidden -Command Set-Location 'C:\Users\robin\Desktop\GiftBlox'; node main.js", 0, False