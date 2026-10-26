const neo4j = require('../database');

class User {
    constructor(id, username, email, password) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.password = password; // Em produção, lembre-se de usar bcrypt para criptografar!
    }

    // 1. Cadastrar usuário no banco Neo4j
    async save() {
        const session = neo4j.getSession();
        try {
            const query = `
                CREATE (u:User {id: randomUUID(), username: $username, email: $email, password: $password})
                RETURN u
            `;
            const result = await session.run(query, {
                username: this.username,
                email: this.email,
                password: this.password
            });
            return result.records[0].get('u').properties;
        } finally {
            await session.close();
        }
    }

    // 2. Efetuar Login (pesquisa no banco se existe o usuário e senha)
    static async login(email, password) {
        const session = neo4j.getSession();
        try {
            const query = `
                MATCH (u:User {email: $email, password: $password})
                RETURN u
            `;
            const result = await session.run(query, { email, password });
            if (result.records.length === 0) {
                throw new Error('E-mail ou senha inválidos.');
            }
            return result.records[0].get('u').properties;
        } finally {
            await session.close();
        }
    }

    // 3. Dar Like ou Deslike em um filme
    static async rateMovie(userId, movieId, liked) {
        const session = neo4j.getSession();
        const relType = liked ? 'LIKED' : 'DISLIKED';
        const oppositeRel = liked ? 'DISLIKED' : 'LIKED';
        
        try {
            const query = `
                MATCH (u:User {id: $userId})
                MATCH (m:Movie {id: $movieId})
                OPTIONAL MATCH (u)-[r:${oppositeRel}]->(m)
                DELETE r
                MERGE (u)-[newRel:${relType}]->(m)
                RETURN type(newRel) AS rel
            `;
            const result = await session.run(query, { userId, movieId });
            return result.records[0].get('rel');
        } finally {
            await session.close();
        }
    }

    // 4. Histórico: Armazena e garante que guarda apenas os últimos 6 filmes visualizados
    static async addHistory(userId, movieId) {
        const session = neo4j.getSession();
        try {
            const query = `
                MATCH (u:User {id: $userId})
                MATCH (m:Movie {id: $movieId})
                MERGE (u)-[r:VIEWED]->(m)
                SET r.timestamp = datetime()
                WITH u
                MATCH (u)-[r:VIEWED]->(m)
                ORDER BY r.timestamp DESC
                WITH u, collect({rel: r, movie: m}) as views
                FOREACH (i in range(6, size(views)-1) | 
                    DELETE (views[i]).rel
                )
                RETURN "Histórico atualizado com sucesso"
            `;
            await session.run(query, { userId, movieId });
        } finally {
            await session.close();
        }
    }
}

module.exports = User;