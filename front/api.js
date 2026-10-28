// Endereço da API. Quando o front é aberto pelo próprio servidor (http://localhost:3000)
// basta deixar vazio. Se abrir o HTML direto do disco, usa localhost:3000.
const API_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

async function request(method, path, body) {
    let res;
    try {
        res = await fetch(API_URL + path, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch {
        throw new Error('Não foi possível falar com o servidor. Ele está rodando? (npm start na pasta backend)');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
}

const api = {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body)
};

// Sessão do usuário logado (guardada no navegador)
const Auth = {
    getUser() {
        try { return JSON.parse(sessionStorage.getItem('pseudoflixUser')); } catch { return null; }
    },
    setUser(user) {
        try { sessionStorage.setItem('pseudoflixUser', JSON.stringify(user)); } catch { /* ignora */ }
    },
    logout() {
        try { sessionStorage.removeItem('pseudoflixUser'); } catch { /* ignora */ }
        window.location.href = 'login.html';
    }
};
