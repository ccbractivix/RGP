'use strict';
const axios = require('axios');
const BASE = 'https://api.themoviedb.org/3';
async function fetchPoster(imdbId) {
  const res = await axios.get(`${BASE}/find/${imdbId}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
    params: { external_source: 'imdb_id' },
  });
  const results = res.data.movie_results || [];
  if (!results.length || !results[0].poster_path) return null;
  return `https://image.tmdb.org/t/p/w300${results[0].poster_path}`;
}
module.exports = { fetchPoster };
