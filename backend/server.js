const path = require('path');
const express = require('express');
const cors = require('cors');

const db = require('./database');
const User = require('./models/User');
const Movie = require('./models/Movie');
const Recommendation = require('./models/Recommendation');

const app = express();
app.use(express.json());
app.use(cors());

// Serve o front-end: abra http://localhost:3000 no navegador
app.use(express.static(path.join(__dirname, '..', 'front')));

// Pequeno helper para não repetir try/catch em toda rota
const handle = (fn, errorStatus = 500) => async (req, res) => {
    try {
        res.json(await fn(req, res));
    } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error.message);
        res.status(error.status || errorStatus).json({ error: error.message });
    }
};

// ---------- Saúde ----------
app.get('/api/health', handle(async () => {
    const r = await db.run(`
        OPTIONAL MATCH (n) WHERE n:Movie OR n:User OR n:Genre
        RETURN sum(CASE WHEN n:Movie THEN 1 ELSE 0 END) AS filmes,
               sum(CASE WHEN n:User  THEN 1 ELSE 0 END) AS usuarios,
               sum(CASE WHEN n:Genre THEN 1 ELSE 0 END) AS generos
    `);
    return { status: 'ok', message: 'API do PseudoFlix rodando com sucesso!', ...r.records[0].toObject() };
}));

// ---------- Usuários ----------
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const user = await new User(null, username, email, password).save();
        res.status(201).json({ message: 'Usuário cadastrado com sucesso!', user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/login', handle(async (req) => {
    const { email, password } = req.body; // "email" pode ser e-mail ou nome de usuário
    const user = await User.login(email, password);
    return { message: 'Login realizado com sucesso!', user };
}, 401));

app.get('/api/users', handle(() => User.getAll()));
app.get('/api/users/:id/history', handle(req => User.getHistory(req.params.id, Number(req.query.limit) || 6)));
app.get('/api/users/:id/interactions', handle(req => User.getInteractions(req.params.id), 404));
app.get('/api/users/:id/recommendations', handle(req =>
    Recommendation.forUser(req.params.id, Number(req.query.limit) || 12), 404));
app.get('/api/users/:id/similar-users', handle(req => Recommendation.similarUsers(req.params.id)));

// ---------- Filmes ----------
app.get('/api/movies', handle(() => Movie.getAll()));
app.get('/api/movies/popular', handle(req => Movie.getPopular(Number(req.query.limit) || 10)));
app.get('/api/genres', handle(() => Movie.getGenres()));
app.get('/api/movies/:id', handle(async (req) => {
    const movie = await Movie.getById(req.params.id);
    if (!movie) throw Object.assign(new Error('Filme não encontrado.'), { status: 404 });
    return movie;
}));
app.get('/api/movies/:id/similar', handle(req => Movie.getSimilar(req.params.id)));

// ---------- Interações ----------
// body: { userId, movieId, rating: "like" | "dislike" | "none" }
// (também aceita o formato antigo { liked: true/false })
app.post('/api/rate', handle(async (req) => {
    const { userId, movieId } = req.body;
    let { rating } = req.body;
    if (!rating && typeof req.body.liked === 'boolean') rating = req.body.liked ? 'like' : 'dislike';
    if (!['like', 'dislike', 'none'].includes(rating)) {
        throw Object.assign(new Error('rating deve ser "like", "dislike" ou "none".'), { status: 400 });
    }
    await User.rateMovie(userId, movieId, rating);
    return { message: `Avaliação salva: ${rating}`, rating };
}));

// body: { userId, movieId }
app.post('/api/watch', handle(async (req) => {
    const { userId, movieId } = req.body;
    const times = await User.watchMovie(userId, movieId);
    return { message: 'Filme marcado como assistido.', times };
}));

// ---------- Inicialização ----------
const PORT = process.env.PORT || 3000;

(async () => {
    try {
        await db.verifyConnection();
        await db.initSchema();
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
        });
    } catch {
        await db.closeDriver();
        process.exit(1);
    }
})();
