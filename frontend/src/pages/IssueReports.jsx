import React, { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../components/Layout'
import { Loading, EmptyState } from '../components/Feedback'
import { StatusBadge, PriorityBadge } from '../components/Badge'
import CaseDetailDrawer from '../components/CaseDetailDrawer'
import { IconPlus, IconRefresh } from '../components/icons'

const CATEGORIES = ['Billing', 'Technical Support', 'Account Access', 'Onboarding', 'Feature Request', 'Bug Report', 'Data Migration', 'Compliance']
const CONTACT_METHODS = ['Email', 'Phone Call']
const STATUS_BADGE = {
  'Pending Review': 'pri-Medium',
  'Reviewed': 'st-Active',
  'Converted to Case': 'st-Completed',
  'Rejected': 'pri-Critical',
}

const today = () => new Date().toISOString().slice(0, 10)

export default function IssueReports() {
  const { user } = useAuth()
  const toast = useToast()
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [openCaseId, setOpenCaseId] = useState(null)
  const [f, setF] = useState({
    customer_name: '', customer_email: '', customer_phone: '',
    contact_method: 'Phone Call', issue_title: '', category: 'Billing',
    description: '', reference_info: '', reported_date: today(),
  })

  const load = useCallback(() => {
    setLoading(true)
    apiGet('/api/issue-reports').then(d => setReports(d.reports || []))
      .catch(() => setReports([])).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!f.customer_name || !f.issue_title) { toast('Customer name and issue title are required', 'err'); return }
    try {
      await apiPost('/api/issue-reports', f)
      toast('Issue report submitted to Team Lead')
      setF({ customer_name: '', customer_email: '', customer_phone: '',
        contact_method: 'Phone Call', issue_title: '', category: 'Billing',
        description: '', reference_info: '', reported_date: today() })
      setShowForm(false)
      load()
    } catch (e2) { toast(e2.response?.data?.error || 'Failed to submit report', 'err') }
  }

  const [convertForm, setConvertForm] = useState(null)  // {rid, due_date, next_action_date, next_action}
  const [convertErr, setConvertErr] = useState({})

  const convert = async (rid) => {
    // Open the inline conversion form (replaces prompt())
    setConvertForm({ rid, due_date: '', next_action_date: '', next_action: '' })
    setConvertErr({})
  }

  const submitConvert = async (e) => {
    e.preventDefault()
    const f = convertForm
    const errs = {}
    if (!f.due_date) errs.due_date = 'Due date is required'
    if (f.next_action_date && f.due_date && f.next_action_date > f.due_date)
      errs.next_action_date = 'Next action date must be on or before the due date'
    if (Object.keys(errs).length > 0) { setConvertErr(errs); return }

    try {
      const body = { due_date: f.due_date }
      if (f.next_action_date) body.next_action_date = f.next_action_date
      if (f.next_action) body.next_action = f.next_action
      const d = await apiPost(`/api/issue-reports/${f.rid}/convert`, body)
      toast(`Case ${d.case.case_code} created and auto-assigned to ${d.case.assigned_to_name || 'Awaiting Assignment'}`)
      setConvertForm(null)
      load()
    } catch (e2) { toast(e2.response?.data?.error || 'Failed to convert report', 'err') }
  }

  const reject = async (rid) => {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return
    try {
      await apiPost(`/api/issue-reports/${rid}/reject`, { reason })
      toast('Report rejected')
      load()
    } catch (e) { toast(e.response?.data?.error || 'Failed to reject report', 'err') }
  }

  const isTeamLead = user?.role === 'Team Lead'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Customer Issue Reports</div>
          <div className="page-sub">
            {isTeamLead
              ? 'Review customer issue reports submitted by operational staff. Convert valid reports to official cases.'
              : 'Submit customer issue reports to your Team Lead for review. Customers contact you via email or phone.'}
          </div>
        </div>
        <div className="flex gap-8">
          <button className="btn" onClick={load}><IconRefresh size={16} /> Refresh</button>
          {!isTeamLead && (
            <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
              <IconPlus size={16} /> New Report
            </button>
          )}
        </div>
      </div>

      {!isTeamLead && showForm && (
        <form className="card card-pad" style={{ marginBottom: 16 }} onSubmit={submit}>
          <div className="section-title" style={{ marginTop: 0 }}>Submit Customer Issue Report</div>
          <div className="form-grid">
            <div className="field"><label className="lbl">Customer Name *</label><input className="inp" value={f.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="Customer name" /></div>
            <div className="field"><label className="lbl">Contact Method *</label><select className="inp" value={f.contact_method} onChange={e => set('contact_method', e.target.value)}>{CONTACT_METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label className="lbl">Customer Email (optional)</label><input className="inp" value={f.customer_email} onChange={e => set('customer_email', e.target.value)} placeholder="customer@email.com" /></div>
            <div className="field"><label className="lbl">Customer Phone (optional)</label><input className="inp" value={f.customer_phone} onChange={e => set('customer_phone', e.target.value)} placeholder="+1 555-0100" /></div>
            <div className="field full"><label className="lbl">Issue Title *</label><input className="inp" value={f.issue_title} onChange={e => set('issue_title', e.target.value)} placeholder="Brief description of the issue" /></div>
            <div className="field"><label className="lbl">Category *</label><select className="inp" value={f.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label className="lbl">Reported Date</label><input type="date" className="inp" value={f.reported_date} onChange={e => set('reported_date', e.target.value)} /></div>
            <div className="field full"><label className="lbl">Reference Info (optional)</label><input className="inp" value={f.reference_info} onChange={e => set('reference_info', e.target.value)} placeholder="Ticket number, order ID, etc." /></div>
            <div className="field full"><label className="lbl">Description</label><textarea className="inp" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Describe the customer's issue in detail…" /></div>
          </div>
          <div className="flex gap-8" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" type="submit">Submit Report</button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-head"><div className="card-title">{reports?.length || 0} report{(reports?.length || 0) === 1 ? '' : 's'}</div></div>
        {loading ? <Loading label="Loading reports…" />
          : !reports || reports.length === 0 ? <EmptyState title="No customer issue reports yet" sub={isTeamLead ? 'Reports submitted by operational staff will appear here.' : 'Submit a report using the New Report button above.'} />
          : <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th><th>Customer</th><th>Issue Title</th><th>Category</th>
                    <th>Contact</th><th>Reported By</th><th>Date</th><th>Status</th>
                    {isTeamLead && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.report_id}>
                      <td className="code">#{r.report_id}</td>
                      <td><div>{r.customer_name}</div><div className="muted text-xs">{r.customer_email || r.customer_phone || '—'}</div></td>
                      <td className="title-cell">{r.issue_title}</td>
                      <td className="muted">{r.category}</td>
                      <td className="muted text-sm">{r.contact_method}</td>
                      <td className="muted">{r.reported_by_name}</td>
                      <td className="mono muted">{r.reported_date}</td>
                      <td><span className={`badge ${STATUS_BADGE[r.status] || 'pri-Low'}`}>{r.status}</span></td>
                      {isTeamLead && (
                        <td>
                          {r.status === 'Pending Review' && (
                            <div className="flex gap-8">
                              <button className="btn btn-sm btn-primary" onClick={() => convert(r.report_id)}>Convert to Case</button>
                              <button className="btn btn-sm" onClick={() => reject(r.report_id)}>Reject</button>
                            </div>
                          )}
                          {convertForm && convertForm.rid === r.report_id && (
                            <form onSubmit={submitConvert} style={{ marginTop: 8, padding: 10, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                              <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>Convert to Official Case</div>
                              <div className="field" style={{ marginBottom: 8 }}>
                                <label className="lbl">Due Date *</label>
                                <input type="date" className="inp" style={{ height: 34 }} value={convertForm.due_date}
                                  onChange={e => setConvertForm(s => ({ ...s, due_date: e.target.value }))} />
                                {convertErr.due_date && <div className="field-error">{convertErr.due_date}</div>}
                              </div>
                              <div className="field" style={{ marginBottom: 8 }}>
                                <label className="lbl">Next Action Date (optional)</label>
                                <input type="date" className="inp" style={{ height: 34 }} value={convertForm.next_action_date}
                                  onChange={e => setConvertForm(s => ({ ...s, next_action_date: e.target.value }))} />
                                {convertErr.next_action_date && <div className="field-error">{convertErr.next_action_date}</div>}
                              </div>
                              <div className="field" style={{ marginBottom: 10 }}>
                                <label className="lbl">Next Action (optional)</label>
                                <input className="inp" style={{ height: 34 }} placeholder="e.g. Investigate the issue" value={convertForm.next_action}
                                  onChange={e => setConvertForm(s => ({ ...s, next_action: e.target.value }))} />
                              </div>
                              <div className="flex gap-8">
                                <button className="btn btn-sm btn-primary" type="submit">Create Case</button>
                                <button type="button" className="btn btn-sm" onClick={() => setConvertForm(null)}>Cancel</button>
                              </div>
                            </form>
                          )}
                          {r.converted_case_code && (
                            <span className="tag-link" onClick={() => setOpenCaseId(r.converted_case_id)}>{r.converted_case_code} →</span>
                          )}
                          {r.status === 'Rejected' && r.rejection_reason && (
                            <span className="text-xs muted" title={r.rejection_reason}>Rejected: {r.rejection_reason.slice(0, 30)}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </div>

      {openCaseId && <CaseDetailDrawer caseId={openCaseId} onClose={() => setOpenCaseId(null)} onChanged={load} />}
    </div>
  )
}
