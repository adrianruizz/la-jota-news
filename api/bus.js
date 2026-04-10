import axios from 'axios';

export default async function handler(req, res) {
  const { poste } = req.query;
  if (!poste) return res.status(400).json({ error: 'Poste required' });

  try {
    const response = await axios.get(`https://api.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste/${poste}.json`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching bus data' });
  }
}
