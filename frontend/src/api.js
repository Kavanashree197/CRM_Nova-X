import axios from 'axios'

// Single axios instance. Every request automatically attaches the auth token.
const api = axios.create({ baseURL: '', withCredentials: false })

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('crm_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // On 401, clear local session and bounce to login.
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('crm_token')
      localStorage.removeItem('crm_user')
      if (!window.location.pathname.endsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// Convenience helpers so pages don't repeat try/catch plumbing.
export async function apiGet(url, params) {
  const r = await api.get(url, { params })
  return r.data
}
export async function apiPost(url, body) {
  const r = await api.post(url, body)
  return r.data
}
export async function apiPut(url, body) {
  const r = await api.put(url, body)
  return r.data
}
export async function apiDelete(url) {
  const r = await api.delete(url)
  return r.data
}
