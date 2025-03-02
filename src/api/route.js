import http from './http'

export const routeApi = {
    calcRoute(data) {
        return http.post('/route', data)
    },
}