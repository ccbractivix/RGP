'use strict';
const axios = require('axios');

function parseOmdbData(d) {
  const runtimeMin = d.Runtime ? parseInt(d.Runtime, 10) : null;
  return {
    imdbId: d.imdbID || null,
    title: d.Title || '',
    mpaaRating: d.Rated || '',
    runtimeMin: isNaN(runtimeMin) ? null : runtimeMin,
    genres: d.Genre ? d.Genre.split(',').map(g => g.trim()) : [],
    imdbRating: d.imdbRating ? parseFloat(d.imdbRating) : null,
    year: d.Year || '',
    poster: d.Poster && d.Poster !== 'N/A' ? d.Poster : null,
  };
}

async function fetchMovie(imdbId) {
  const res = await axios.get('http://www.omdbapi.com/', { params: { i: imdbId, apikey: process.env.OMDB_API_KEY } });
  const d = res.data;
  if (d.Response === 'False') throw new Error(`OMDB: ${d.Error}`);
  return parseOmdbData(d);
}

async function fetchMovieByTitle(title, year) {
  const params = { t: title, apikey: process.env.OMDB_API_KEY };
  if (year) params.y = String(year);
  const res = await axios.get('http://www.omdbapi.com/', { params });
  const d = res.data;
  if (d.Response === 'False') throw new Error(`OMDB: ${d.Error}`);
  return parseOmdbData(d);
}

module.exports = { fetchMovie, fetchMovieByTitle };
