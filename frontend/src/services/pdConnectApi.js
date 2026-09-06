import { apiRequest } from '../lib/api'

export function requestAuthToken(payload) {
  return apiRequest('/auth/token/', {
    method: 'POST',
    body: payload,
    skipAuth: true,
    skipAuthRefresh: true,
  })
}

export function getAuthenticatedProfile() {
  return apiRequest('/auth/profile/')
}

export function forgotPassword(payload) {
  return apiRequest('/auth/forgot-password/', {
    method: 'POST',
    body: payload,
    skipAuth: true,
    skipAuthRefresh: true,
  })
}

export function resetPassword(payload) {
  return apiRequest('/auth/reset-password/', {
    method: 'POST',
    body: payload,
    skipAuth: true,
    skipAuthRefresh: true,
  })
}
