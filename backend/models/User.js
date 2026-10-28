const db = require('../database');

// Nunca devolve a senha para o front
const USER_PROJECTION = 'u { .id, .username, .email }';

class User {
    constructor(id, username, email, password) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.password = password; // Em produção, use bcrypt para criptografar!
    }

    // 1. Cadastrar usuário
    async save() {
        if (!this.username || !this.email || !this.password) {
            throw new Error('Preencha nome de usuário, e-mail e senha.');
        }
        const existing = await db.run('MATCH (u:User {email: $email}) RETURN u', { email: this.email });
        if (existing.records.length > 0) throw new Error('Já existe um usuário com este e-mail.');

        const result = await db.run(`
            CREATE (u:User {id: randomUUID(), username: $username, email: $email,
                            password: $password, createdAt: datetime()})
            RETURN ${USER_PROJECTION} AS user
        `, { username: this.username, email: this.email, password: this.password });
        return result.records[0].get('user');
    }

    // 2. Login (aceita e-mail ou nome de usuário)
    static async login(login, password) {
        const result = await db.run(`
            MATCH (u:User)
            WHERE (u.email = $login OR u.username = $login) AND u.password = $password
            RETURN ${USER_PROJECTION} AS user
        `, { login, password });
        if (result.records.length === 0) throw new Error('E-mail ou senha inválidos.');
        return result.records[0].get('user');
    }

    static async getAll() {
        const result = await db.run(`MATCH (u:User) RETURN ${USER_PROJECTION} AS user ORDER BY u.username`);
        return result.records.map(r => r.get('user'));
    }

    // 3. Like / Dislike / remover avaliação
    //    rating: 'like' | 'dislike' | 'none'
    //    Like e dislike são exclusivos: dar like apaga o dislike e vice-versa.
    static async rateMovie(userId, movieId, rating) {
        const relType = rating === 'like' ? 'LIKED' : rating === 'dislike' ? 'DISLIKED' : null;
        // Apaga a avaliação anterior (se existir)
        const result = await db.run(`
            MATCH (u:User {id: $userId}), (m:Movie {id: $movieId})
            OPTIONAL MATCH (u)-[old:LIKED|DISLIKED]->(m)
            DELETE old
            WITH DISTINCT u
            RETURN u.id AS ok
        `, { userId, movieId });
        if (result.records.length === 0) throw new Error('Usuário ou filme não encontrado.');

        if (relType) {
            // Tipo de relacionamento não pode ser parâmetro no Cypher, por isso vem do whitelist acima
            await db.run(`
                MATCH (u:User {id: $userId}), (m:Movie {id: $movieId})
                MERGE (u)-[r:${relType}]->(m)
                SET r.at = datetime()
            `, { userId, movieId });
        }
        return rating;
    }

    // 4. Registrar que o usuário assistiu um filme
    static async watchMovie(userId, movieId) {
        const result = await db.run(`
            MATCH (u:User {id: $userId}), (m:Movie {id: $movieId})
            MERGE (u)-[w:WATCHED]->(m)
            ON CREATE SET w.times = 0
            SET w.times = w.times + 1, w.at = datetime()
            RETURN w.times AS times
        `, { userId, movieId });
        if (result.records.length === 0) throw new Error('Usuário ou filme não encontrado.');
        return result.records[0].get('times');
    }

    // 5. Histórico: os últimos N filmes assistidos (padrão 6)
    static async getHistory(userId, limit = 6) {
        const result = await db.run(`
            MATCH (u:User {id: $userId})-[w:WATCHED]->(m:Movie)
            RETURN m { .*, genres: [(m)-[:IN_GENRE]->(g:Genre) | g.name], watchedAt: toString(w.at) } AS movie
            ORDER BY w.at DESC
            LIMIT $limit
        `, { userId, limit: db.neo4j.int(limit) });
        return result.records.map(r => r.get('movie'));
    }

    // 6. Como o usuário se relaciona com cada filme (para pintar os botões no front)
    static async getInteractions(userId) {
        const result = await db.run(`
            MATCH (u:User {id: $userId})
            RETURN [(u)-[:LIKED]->(m:Movie) | m.id]    AS liked,
                   [(u)-[:DISLIKED]->(m:Movie) | m.id] AS disliked,
                   [(u)-[:WATCHED]->(m:Movie) | m.id]  AS watched
        `, { userId });
        if (result.records.length === 0) throw new Error('Usuário não encontrado.');
        const r = result.records[0];
        return { liked: r.get('liked'), disliked: r.get('disliked'), watched: r.get('watched') };
    }
}

module.exports = User;
