/*
 * Busca filmes de domínio público na API pública do Internet Archive (archive.org).
 * A coleção "feature_films" só tem longas de domínio público / licença livre,
 * e cada item já vem com pôster e player de vídeo embutível.
 *
 * Documentação da API: https://archive.org/advancedsearch.php
 */

const API = 'https://archive.org/advancedsearch.php';

// Gêneros do PseudoFlix -> busca na API + palavras-chave para detectar gêneros extras
const GENRES = [
    { name: 'Terror',            query: 'subject:(horror OR zombie OR zombies OR vampire OR vampires)',            match: /horror|zombie|vampire|terror|monster/ },
    { name: 'Comédia',           query: 'subject:(comedy OR comedies OR slapstick)',                                match: /comed|slapstick|humor|humour/ },
    { name: 'Ficção Científica', query: 'subject:("science fiction" OR "sci-fi" OR scifi OR "sci fi")',           match: /science fiction|sci-?fi|sci fi|alien|space/ },
    { name: 'Ação & Aventura',   query: 'subject:(action OR adventure OR western OR westerns OR war)',              match: /action|adventure|western|war\b|swashbuckl/ },
    { name: 'Drama',             query: 'subject:(drama OR romance OR "film noir" OR noir)',                        match: /drama|romance|noir|melodrama/ }
];

const toArray = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

function cleanText(html, max = 500) {
    const text = toArray(html).join(' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= max) return text;
    return text.slice(0, text.lastIndexOf(' ', max)) + '…';
}

async function searchArchive(query, rows) {
    const params = new URLSearchParams({
        q: `collection:feature_films AND mediatype:movies AND (${query})`,
        rows: String(rows),
        page: '1',
        output: 'json'
    });
    ['identifier', 'title', 'year', 'description', 'subject', 'creator', 'runtime', 'downloads']
        .forEach(f => params.append('fl[]', f));
    params.append('sort[]', 'downloads desc'); // os mais assistidos primeiro

    const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': 'PseudoFlix-seed/1.0' } });
    if (!res.ok) throw new Error(`Internet Archive respondeu HTTP ${res.status}`);
    const json = await res.json();
    return json.response?.docs || [];
}

function toMovie(doc, mainGenre) {
    const subjects = toArray(doc.subject).join(' ').toLowerCase();
    const genres = new Set([mainGenre]);
    for (const g of GENRES) if (g.match.test(subjects)) genres.add(g.name);

    const year = parseInt(String(doc.year || '').slice(0, 4), 10);
    return {
        id: doc.identifier,
        title: cleanText(doc.title, 120),
        year: Number.isFinite(year) ? year : null,
        synopsis: cleanText(doc.description) || 'Sinopse não disponível.',
        director: toArray(doc.creator).join(', ') || null,
        runtime: doc.runtime ? String(toArray(doc.runtime)[0]) : null,
        posterUrl: `https://archive.org/services/img/${doc.identifier}`,
        videoUrl: `https://archive.org/embed/${doc.identifier}`,
        pageUrl: `https://archive.org/details/${doc.identifier}`,
        downloads: Number(doc.downloads) || 0,
        genres: [...genres].slice(0, 3)
    };
}

// Retorna exatamente `total` filmes, distribuídos igualmente entre os gêneros
async function fetchPublicDomainMovies(total = 50) {
    const perGenre = Math.ceil(total / GENRES.length);
    const chosen = new Map();

    for (const genre of GENRES) {
        const docs = await searchArchive(genre.query, perGenre * 4);
        let added = 0;
        for (const doc of docs) {
            if (added >= perGenre || chosen.size >= total) break;
            if (!doc.identifier || !doc.title || chosen.has(doc.identifier)) continue;
            chosen.set(doc.identifier, toMovie(doc, genre.name));
            added++;
        }
        console.log(`  • ${genre.name}: ${added} filmes`);
    }

    // Se faltou algum (gêneros com poucos resultados), completa com os mais baixados
    if (chosen.size < total) {
        const docs = await searchArchive('*:*', total * 3);
        for (const doc of docs) {
            if (chosen.size >= total) break;
            if (!doc.identifier || !doc.title || chosen.has(doc.identifier)) continue;
            const subjects = toArray(doc.subject).join(' ').toLowerCase();
            const g = GENRES.find(x => x.match.test(subjects)) || GENRES[4];
            chosen.set(doc.identifier, toMovie(doc, g.name));
        }
    }

    return [...chosen.values()].slice(0, total);
}

module.exports = { fetchPublicDomainMovies, GENRES, toMovie, cleanText };
