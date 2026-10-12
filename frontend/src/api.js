import axios from 'axios';

const TOKEN_KEY = 'evms_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

const api = axios.create({ baseURL: `${import.meta.env.VITE_API_URL || ''}/api` });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired or invalid token sends the person back to the login page.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const onLogin = window.location.pathname === '/login';
    if (err.response?.status === 401 && !onLogin) {
      setToken(null);
      window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);

// Normalises server errors into { message, fields }.
export function parseError(err) {
  const data = err.response?.data;
  if (data) return { message: data.error || 'Something went wrong', fields: data.fields || {} };
  return { message: 'Cannot reach the server. Check your connection and try again.', fields: {} };
}

export default api;
