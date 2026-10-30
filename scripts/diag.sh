#!/usr/bin/env bash
# Diagnostic: capture the accessibility-tree text of each page so we can verify
# the app actually rendered the expected content (without needing vision).
set -u
pkill -9 -f "backend/app.py" 2>/dev/null
sleep 1
python3 /home/z/my-project/backend/seed.py >/tmp/seed.log 2>&1
setsid python3 /home/z/my-project/backend/app.py >/tmp/flask.log 2>&1 < /dev/null &
FPID=$!
disown 2>/dev/null
sleep 3

AB="agent-browser"
$AB set viewport 1440 900 >/dev/null 2>&1
$AB open http://127.0.0.1:5000/ >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1

echo "########## LOGIN PAGE ##########"
$AB snapshot -c 2>&1 | head -30

echo; echo "########## CLICK SIGN IN ##########"
$AB find role button click --name "Sign in" 2>&1 | head -3
$AB wait --load networkidle >/dev/null 2>&1
sleep 1

echo; echo "########## OVERVIEW (after login) ##########"
$AB get url 2>&1
$AB get title 2>&1
$AB snapshot -c 2>&1 | head -60

echo; echo "########## CREATE CASE PAGE ##########"
$AB open http://127.0.0.1:5000/create-case >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB snapshot -c 2>&1 | head -40

echo; echo "########## INTERACTIVE ELEMENTS ON CREATE CASE ##########"
$AB snapshot -i 2>&1 | head -40

echo; echo "########## FILL TITLE + CLICK CREATE ##########"
$AB find label "Case title" fill "Dashboard chart not rendering after date filter" 2>&1 | head -2
$AB find label "Description" fill "Customer reports the bar chart goes blank when applying a 7-day filter. Reproduced on Chrome 118." 2>&1 | head -2
$AB find label "Due date" fill "2026-11-07" 2>&1 | head -2
$AB find label "Next action date" fill "2026-11-01" 2>&1 | head -2
$AB find label "Next action" fill "Reproduce locally and bisect" 2>&1 | head -2
$AB snapshot -i 2>&1 | grep -iE "title|button|textbox" | head -10
$AB find role button click --name "Create case" 2>&1 | head -2
sleep 1
echo "after create click, url:"; $AB get url 2>&1
$AB snapshot -c 2>&1 | head -45

echo; echo "########## ACTIVITY LOGS ##########"
$AB open http://127.0.0.1:5000/activity-logs >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB snapshot -c 2>&1 | head -40

echo; echo "########## PRODUCTIVITY ##########"
$AB open http://127.0.0.1:5000/reports >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB snapshot -c 2>&1 | head -40

echo; echo "########## TEAM ##########"
$AB open http://127.0.0.1:5000/team >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB snapshot -c 2>&1 | head -40

echo; echo "########## SETTINGS ##########"
$AB open http://127.0.0.1:5000/settings >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB snapshot -c 2>&1 | head -30

echo; echo "########## PAGE ERRORS ##########"
$AB errors 2>&1 | head -20

$AB close >/dev/null 2>&1
kill -9 $FPID 2>/dev/null
echo "done"