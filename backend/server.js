const express = require('express');
const cors = require('cors');
require('dotenv').config();

const User = require('./models/User');
const Movie = require('./models/Movie');

const app = express();
app.use(express.json());
app.use(cors());

// Rota de Teste
app.get('/', (req, res) => {
    res.json({ message: "API do PseudoFlix rodando com sucesso!" });
});

// 1. Rota de Cadastro de Usuário
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const user = new User(null, username, email, password);
        const savedUser = await user.save();
        res.status(201).json({ message: "Usuário cadastrado com sucesso!", user: savedUser });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 2. Rota de Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.login(email, password);
        res.json({ message: "Login realizado com sucesso!", user });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// 3. Rota para Listar Filmes
app.get('/api/movies', async (req, res) => {
    try {
        const movies = await Movie.getAll();
        res.json(movies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Rota para Dar Like/Dislike
app.post('/api/rate', async (req, res) => {
    try {
        const { userId, movieId, liked } = req.body;
        const relation = await User.rateMovie(userId, movieId, liked);
        res.json({ message: `Filme marcado como ${relation} com sucesso!` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Inicializar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});