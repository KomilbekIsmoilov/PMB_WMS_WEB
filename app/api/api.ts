// api/index.ts
import { env } from 'process';
import axios from 'axios';

const isBrowser = typeof window !== 'undefined';
const token = isBrowser ? localStorage.getItem('token') : null;
const api = axios.create({
    baseURL: 'http://213.230.124.245:5010/api',  
    headers: {
        Authorization: token ? `Bearer ${token}` : ''
    }
});

api.interceptors.request.use((config) => {
    if (isBrowser) {
        const updatedToken = localStorage.getItem('token');
        if (updatedToken) {
            config.headers.Authorization = `Bearer ${updatedToken}`;
        } else {
            window.location.href = '/auth/access';
        }
    }
    return config;
});

export default api;