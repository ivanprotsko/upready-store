// Thin HTTP client for the tenant panel API (/tenants/*) and tenant auth.
export function makeClient(backendUrl) {
  let token = null;
  const call = async (method, path, body, { auth = true, form = null } = {}) => {
    const headers = {};
    if (auth && token) headers.authorization = `Bearer ${token}`;
    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${backendUrl}${path}`, { method, headers, body: payload });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status} ${json?.message ?? text.slice(0, 300)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  };
  return {
    setToken: (t) => {
      token = t;
    },
    get: (path) => call("GET", path),
    post: (path, body, opts) => call("POST", path, body, opts),
    put: (path, body) => call("PUT", path, body),
    del: (path) => call("DELETE", path),
    upload: (path, form) => call("POST", path, undefined, { form }),
  };
}
