const API_BASE_URL = '/api';

export const apiUrl = (path) => `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;

export const apiFetch = async (path, options = {}) => {
	const headers = new Headers(options.headers || {});
	headers.delete('Authorization');
	if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
		headers.set('X-Requested-With', 'JobOrbit');
	}
	const response = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' });
	if (response.status === 401 && typeof window !== 'undefined') {
		window.dispatchEvent(new Event('joborbit:unauthorized'));
	}
	return response;
};

export const readApiResponse = async (response, action = 'Request') => {
	const contentType = response.headers.get('content-type') || '';
	const isJson = /(?:application\/json|\+json)(?:\s*;|$)/i.test(contentType);

	if (!isJson) {
		if (!response.ok) {
			throw new Error(`${action} failed (HTTP ${response.status}). The API returned no JSON response; check that the backend is running.`);
		}
		throw new Error(`${action} returned an unexpected non-JSON response. Check the API URL and backend configuration.`);
	}

	const text = await response.text();
	if (!text.trim()) {
		throw new Error(`${action} returned an empty response (HTTP ${response.status}). Please try again.`);
	}

	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`${action} returned invalid JSON (HTTP ${response.status}). Please try again.`);
	}

	if (!response.ok) {
		throw new Error(data.message || `${action} failed (HTTP ${response.status}).`);
	}

	return data;
};