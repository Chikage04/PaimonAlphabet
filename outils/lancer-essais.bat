@echo off
rem Lance le serveur d'essais HORS du bac a sable de l'agent.
rem
rem Un serveur demarre depuis l'outil Bash n'est pas joignable par le
rem Chrome de l'utilisateur : le bac a sable isole les sockets. Lance par
rem l'Explorateur, ce script tourne dans un vrai cmd.exe, et le navigateur
rem s'y connecte normalement.
rem
rem Le journal se lit ensuite depuis le terminal : C:\tmp\essais.jsonl

title Essais - lecture a vue
cd /d "%~dp0.."
echo.
echo   Ouvre dans ton navigateur :
echo     http://localhost:8765/lecture-vue.html?essais=1
echo.
echo   Journal : C:\tmp\essais.jsonl
echo   Ferme cette fenetre pour arreter.
echo.
node outils\serveur-essais.js 8765
pause
