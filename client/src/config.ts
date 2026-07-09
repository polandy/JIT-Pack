/** Server base URL: the M19 choice wins over the build-time default. */
export function serverBaseUrl(): string {
  return (
    localStorage.getItem('jitpack_server_url') ??
    ((import.meta.env.VITE_API_URL as string) || 'http://localhost:8080')
  )
}
