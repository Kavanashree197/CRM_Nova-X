// Single axios instance for the CRM. Uses relative /api paths (same-origin
// through the Caddy gateway), attaches the auth token automatically.
import axios from "axios";

const api = axios.create({ baseURL: "", withCredentials: false });

api.interceptors.request.use((cfg) => {
  if (typeof window !== "undefined") {
    const t = localStorage.getItem("crm_token");
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response && err.response.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("crm_token");
      localStorage.removeItem("crm_user");
      window.dispatchEvent(new Event("crm-logout"));
    }
    return Promise.reject(err);
  }
);

export default api;
export const apiGet = async (url: string, params?: any) => (await api.get(url, { params })).data;
export const apiPost = async (url: string, body?: any) => (await api.post(url, body)).data;
export const apiPut = async (url: string, body?: any) => (await api.put(url, body)).data;
