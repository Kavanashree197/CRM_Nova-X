#!/usr/bin/env bash
# Verify the live CRM (Next.js on :3000) through the real UI with agent-browser.
set -u
mkdir -p /tmp/render2
AB="agent-browser"
$AB set viewport 1440 900 >/dev/null 2>&1
$AB open http://127.0.0.1:3000/ >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot /tmp/render2/01-login.png >/dev/null 2>&1
echo "[v] 01-login"

$AB find role button click --name "Sign in" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/02-overview.png >/dev/null 2>&1
echo "[v] 02-overview (dashboard, real KPIs)"
$AB snapshot -c 2>&1 | grep -iE "TOTAL CASES|ACTIVE CASES|COMPLETED CASES|OVERDUE|ACTIONS RECORDED" -A1 | head -12

# Demo 1: Create case
$AB find text "Create Case" click >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/03-create-case.png >/dev/null 2>&1
echo "[v] 03-create-case"
$AB eval "var el=document.querySelector('input[placeholder*=\"Customer cannot access\"]'); var p=HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el,'Dashboard chart not rendering after date filter'); el.dispatchEvent(new Event('input',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB eval "var el=document.querySelector('textarea[placeholder*=\"Describe the customer\"]'); var p=HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el,'Customer reports the bar chart on the overview page goes blank when they apply a 7-day filter. Reproduced on Chrome 118.'); el.dispatchEvent(new Event('input',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB eval "var el=document.querySelector('input[placeholder*=\"Reproduce the issue\"]'); var p=HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el,'Reproduce locally and bisect'); el.dispatchEvent(new Event('input',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB eval "var ds=document.querySelectorAll('input[type=\"date\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(ds[0],'2026-11-07'); ds[0].dispatchEvent(new Event('input',{bubbles:true})); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(ds[1],'2026-11-01'); ds[1].dispatchEvent(new Event('input',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB eval "var sels=document.querySelectorAll('form select'); sels[2].value=[...sels[2].options].find(o=>o.text==='Rahul Verma').value; sels[2].dispatchEvent(new Event('change',{bubbles:true})); 'ok'" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/04-create-filled.png >/dev/null 2>&1
echo "[v] 04-create-filled"
$AB find role button click --name "Create case" >/dev/null 2>&1
sleep 2
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot /tmp/render2/05-drawer.png >/dev/null 2>&1
echo "[v] 05-drawer (Demo 1 - case created)"
$AB snapshot -c 2>&1 | grep -iE "CASE-019|Record Action|History|Edit" | head -5

# Demo 2: Record action
$AB find text "Record Action" click >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/06-action-form.png >/dev/null 2>&1
$AB eval "var el=document.querySelector('textarea[placeholder*=\"What did you do\"]'); var p=HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el,'Reproduced the blank-chart bug on Chrome 118. Root cause is a stale useMemo dependency in the chart wrapper.'); el.dispatchEvent(new Event('input',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB find role button click --name "Record action" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/07-action-recorded.png >/dev/null 2>&1
echo "[v] 07-action-recorded (Demo 2)"

# Demo 3: Edit -> status transitions
$AB find text "Edit" click >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/08-edit.png >/dev/null 2>&1
$AB eval "var s=[...document.querySelectorAll('.drawer select')].find(el=>[...el.options].some(o=>o.text==='Completed')); s.value=[...s.options].find(o=>o.text==='Pending').value; s.dispatchEvent(new Event('change',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB find role button click --name "Save changes" >/dev/null 2>&1
sleep 1
$AB eval "var s=[...document.querySelectorAll('.drawer select')].find(el=>[...el.options].some(o=>o.text==='Completed')); s.value=[...s.options].find(o=>o.text==='Completed').value; s.dispatchEvent(new Event('change',{bubbles:true})); 'ok'" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/09-resolution-field.png >/dev/null 2>&1
echo "[v] 09-resolution-field (note required)"
$AB eval "var el=document.querySelector('textarea[placeholder*=\"Describe how the case\"]'); var p=HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el,'Fixed by adding the missing useMemo deps to the chart component; verified across 5 dashboards in staging and added a regression test.'); el.dispatchEvent(new Event('input',{bubbles:true})); 'ok'" >/dev/null 2>&1
$AB find role button click --name "Save changes" >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/10-completed.png >/dev/null 2>&1
echo "[v] 10-completed (Demo 3)"
$AB find text "History" click >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/render2/11-history.png >/dev/null 2>&1
echo "[v] 11-history (immutable log)"

# Demo 4: Dashboard updated
$AB find text "Overview" click >/dev/null 2>&1
sleep 1
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot --full /tmp/render2/12-overview-updated.png >/dev/null 2>&1
echo "[v] 12-overview-updated (Demo 4 - dashboard reflects new case + actions)"
$AB snapshot -c 2>&1 | grep -iE "TOTAL CASES|COMPLETED CASES" -A1 | head -6

# Demo 5: Productivity
$AB find text "Productivity Reports" click >/dev/null 2>&1
sleep 1
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot --full /tmp/render2/13-productivity.png >/dev/null 2>&1
echo "[v] 13-productivity (Demo 5)"
$AB snapshot -c 2>&1 | grep -iE "Cases Created|Cases Completed|Total Actions|Avg Completion" | head -6

# Other pages
$AB find text "Team Performance" click >/dev/null 2>&1; sleep 1; $AB wait --load networkidle >/dev/null 2>&1; $AB screenshot --full /tmp/render2/14-team.png >/dev/null 2>&1; echo "[v] 14-team"
$AB find text "All Cases" click >/dev/null 2>&1; sleep 1; $AB wait --load networkidle >/dev/null 2>&1; $AB screenshot --full /tmp/render2/15-all-cases.png >/dev/null 2>&1; echo "[v] 15-all-cases"
$AB find text "Activity Logs" click >/dev/null 2>&1; sleep 1; $AB wait --load networkidle >/dev/null 2>&1; $AB screenshot --full /tmp/render2/16-activity.png >/dev/null 2>&1; echo "[v] 16-activity"
$AB find text "My Cases" click >/dev/null 2>&1; sleep 1; $AB wait --load networkidle >/dev/null 2>&1; $AB screenshot --full /tmp/render2/17-my-cases.png >/dev/null 2>&1; echo "[v] 17-my-cases"
$AB find text "Settings" click >/dev/null 2>&1; sleep 1; $AB wait --load networkidle >/dev/null 2>&1; $AB screenshot --full /tmp/render2/18-settings.png >/dev/null 2>&1; echo "[v] 18-settings"

echo "=== page errors ==="
$AB errors 2>&1 | head -15
$AB close >/dev/null 2>&1
echo "=== done; screenshots: $(ls /tmp/render2/ | wc -l) ==="