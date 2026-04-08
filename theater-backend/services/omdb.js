'use strict';
const axios = require('axios');
async function fetchMovie(imdbId) {
  const res = await axios.get('http://www.omdbapi.com/', { params: { i: imdbId, apikey: process.env.OMDB_API_KEY } });
  const d = res.data;
  if (d.Response === 'False') throw new Error(`OMDB: ${d.Error}`);
  const runtimeMin = d.Runtime ? parseInt(d.Runtime, 10) : null;
  return {
    title: d.Title || '',
    mpaaRating: d.Rated || '',
    runtimeMin: isNaN(runtimeMin) ? null : runtimeMin,
    genres: d.Genre ? d.Genre.split(',').map(g => g.trim()) : [],
    imdbRating: d.imdbRating ? parseFloat(d.imdbRating) : null,
    year: d.Year || '',
  };
}
module.exports = { fetchMovie };
