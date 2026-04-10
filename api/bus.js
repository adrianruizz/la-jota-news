export default async function handler(req, res) {
  const { poste } = req.query;
  if (!poste) return res.status(400).json({ error: 'Poste required' });

  try {
    // La URL correcta según la documentación de Datos Abiertos de Zaragoza
    const url = `https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus/tuzsa-${poste}.json`;
    
    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`API de Zaragoza respondió con estado: ${response.status}`);
    }

    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (error) {
    console.error('Bus Proxy Error:', error);
    res.status(500).json({ error: 'Error al conectar con el servicio de Zaragoza' });
  }
}
