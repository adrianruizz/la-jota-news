import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const SECTIONS = ['TODAS', 'LA JOTA', 'VADORREY', 'ARRABAL', 'PICARRAL', 'MARGEN IZQUIERDA', 'RIBERA DEL EBRO', 'ZARAGOZA'];
const SECTION_ICONS = { 'TODAS':'🗞️','LA JOTA':'🏠','VADORREY':'🌊','ARRABAL':'🏰','PICARRAL':'🌳','MARGEN IZQUIERDA':'🌉','RIBERA DEL EBRO':'🚣','ZARAGOZA':'🏛️' };
const SECTION_COLORS = { 'LA JOTA':'#dc2626','VADORREY':'#0891b2','ARRABAL':'#d97706','PICARRAL':'#16a34a','MARGEN IZQUIERDA':'#7c3aed','RIBERA DEL EBRO':'#0284c7','ZARAGOZA':'#2563eb','TODAS':'#2563eb' };
const FALLBACK_PICS = ["/images/barrio_la_jota_1775754247626.png","/images/puente_vadorrey_1775754360579.png","/images/av_cataluna.png","/images/parque_oriente.png"];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Ahora mismo';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} día${d > 1 ? 's' : ''}`;
}

function readingTime(text) {
  if (!text) return '1 min';
  return `${Math.max(1, Math.ceil(text.split(/\s+/).length / 200))} min`;
}

function dateGroup(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays <= 3) return 'Últimos 3 días';
  return 'Esta semana';
}

function extractTrending(news) {
  const stop = new Set(['de','en','la','el','los','las','un','una','del','al','y','a','para','que','por','con','se','su','es','más','ha','ante','sin','como','este','esta','sobre','entre','desde','todo','será','muy','ya','no','han','fue','ser','son','sus','tras','dos','uno','tres']);
  const freq = {};
  news.forEach(n => {
    (n.title + ' ' + (n.summary||'')).toLowerCase().replace(/[^\wáéíóúüñ\s]/g,'').split(/\s+/).forEach(w => { if (w.length > 3 && !stop.has(w)) freq[w] = (freq[w]||0) + 1; });
  });
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10).map(([w]) => w);
}

function ShareIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>; }
function StarIcon({ filled }) { return <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? '#fbbf24' : 'none'} stroke={filled ? '#fbbf24' : 'currentColor'} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }

function handleShare(item) {
  if (navigator.share) navigator.share({ title: item.title, text: item.summary, url: item.link });
  else { navigator.clipboard.writeText(item.link); }
}

// ============ MAIN APP ============
function App() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('TODAS');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('ljn_favs') || '[]'); } catch { return []; } });
  const [modalItem, setModalItem] = useState(null);
  const [weather, setWeather] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const searchRef = useRef(null);
  const prevNewsCount = useRef(0);

  // ===== LOAD NEWS =====
  const loadNews = useCallback(() => {
    fetch('/data/news.json?t=' + Date.now())
      .then(r => r.json())
      .then(data => {
        if (prevNewsCount.current > 0 && data.length > prevNewsCount.current) {
          setNewCount(data.length - prevNewsCount.current);
        }
        prevNewsCount.current = data.length;
        setNews(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadNews();
    // Auto-refresco cada 5 minutos
    const interval = setInterval(loadNews, 5 * 60 * 1000);
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    const handleClick = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', handleClick);
    return () => { clearInterval(interval); window.removeEventListener('scroll', handleScroll); document.removeEventListener('mousedown', handleClick); };
  }, [loadNews]);

  // ===== WEATHER =====
  useEffect(() => {
    fetch('https://wttr.in/Zaragoza?format=%t+%C&lang=es')
      .then(r => r.text())
      .then(t => setWeather(t.trim()))
      .catch(() => setWeather('22°C Soleado'));
  }, []);

  // ===== FAVORITES =====
  const toggleFav = (id) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem('ljn_favs', JSON.stringify(next));
      return next;
    });
  };

  // ===== FILTERED =====
  const filteredNews = useMemo(() => {
    let f = news;
    if (showFavsOnly) f = f.filter(n => favorites.includes(n.id));
    if (activeSection !== 'TODAS') f = f.filter(n => n.category === activeSection);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      f = f.filter(n => n.title.toLowerCase().includes(q) || (n.summary && n.summary.toLowerCase().includes(q)) || n.category.toLowerCase().includes(q) || n.original_source.toLowerCase().includes(q));
    }
    return f;
  }, [news, activeSection, searchQuery, showFavsOnly, favorites]);

  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return news.filter(n => n.title.toLowerCase().includes(q) || (n.summary && n.summary.toLowerCase().includes(q))).slice(0, 5).map(n => ({ id: n.id, title: n.title, category: n.category }));
  }, [news, searchQuery]);

  const sectionCounts = useMemo(() => { const c = {}; SECTIONS.forEach(s => { c[s] = s === 'TODAS' ? news.length : news.filter(n => n.category === s).length; }); return c; }, [news]);
  const trending = useMemo(() => extractTrending(news), [news]);

  // ===== GROUP BY DATE =====
  const groupedGrid = useMemo(() => {
    const grid = filteredNews.slice(5);
    const groups = {};
    grid.forEach(item => {
      const g = dateGroup(item.pub_date);
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    });
    return groups;
  }, [filteredNews]);

  if (loading) return (
    <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',flexDirection:'column',gap:'1.5rem',background:'var(--color-bg)' }}>
      <div className="loading-spinner"></div>
      <h2 style={{ fontFamily:'var(--font-sans)', fontWeight:600, fontSize:'1.1rem' }}>Cargando La Jota News...</h2>
      <p style={{ color:'var(--color-text-muted)', fontSize:'0.85rem' }}>Preparando las últimas noticias de tu barrio</p>
    </div>
  );

  const featured = filteredNews[0];
  const sidebar = filteredNews.slice(1, 5);
  const tickerText = news.slice(0, 10).map(n => `${SECTION_ICONS[n.category]||'📰'} ${n.title}`).join('   •   ');
  const prioritySections = ['LA JOTA', 'VADORREY'];

  return (
    <div className="app-container">
      {/* ===== NEW ARTICLES TOAST ===== */}
      {newCount > 0 && (
        <div className="new-toast" onClick={() => { setNewCount(0); window.scrollTo(0,0); }}>
          🔔 {newCount} noticia{newCount > 1 ? 's' : ''} nueva{newCount > 1 ? 's' : ''} — Pulsa para ver
        </div>
      )}

      {/* ===== MODAL ===== */}
      {modalItem && (
        <div className="modal-overlay" onClick={() => setModalItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalItem(null)}>✕</button>
            {modalItem.image_url && <img src={modalItem.image_url} alt="" className="modal-img" />}
            <div className="modal-body">
              <span className="badge" style={{ background: SECTION_COLORS[modalItem.category], color:'white', marginBottom:'0.75rem' }}>
                {SECTION_ICONS[modalItem.category]} {modalItem.category}
              </span>
              <h2 style={{ fontSize:'1.6rem', marginBottom:'0.75rem' }}>{modalItem.title}</h2>
              <div style={{ display:'flex', gap:'1rem', fontSize:'0.82rem', color:'var(--color-text-muted)', marginBottom:'1rem', flexWrap:'wrap' }}>
                <span>📰 {modalItem.original_source}</span>
                <span>🕐 {timeAgo(modalItem.pub_date)}</span>
                <span>📖 {readingTime(modalItem.summary)} de lectura</span>
              </div>
              <p style={{ fontSize:'1rem', lineHeight:1.75, color:'var(--color-text)', marginBottom:'1.5rem' }}>{modalItem.summary}</p>
              <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
                <a href={modalItem.link} target="_blank" rel="noreferrer" className="source-btn" style={{ background:'var(--color-accent)', color:'white', padding:'0.6rem 1.25rem' }}>
                  📰 Leer artículo completo en {modalItem.original_source} ↗
                </a>
                <button className="source-btn" onClick={() => handleShare(modalItem)}>📤 Compartir</button>
                <button className="source-btn" onClick={() => toggleFav(modalItem.id)}>
                  {favorites.includes(modalItem.id) ? '⭐ Guardado' : '☆ Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== TICKER ===== */}
      <div className="ticker-bar">
        <span className="ticker-label">🔴 EN DIRECTO</span>
        <div className="ticker-content"><span>{tickerText}</span><span>{tickerText}</span></div>
      </div>

      {/* ===== HEADER ===== */}
      <header className="header">
        <div className="header-brand"><div className="logo-icon">LJ</div> La Jota News</div>
        <nav className="header-nav">
          {SECTIONS.map(s => (
            <button key={s} className={activeSection === s && !showFavsOnly ? 'active' : ''}
              style={activeSection === s && !showFavsOnly ? { background: SECTION_COLORS[s], boxShadow: `0 2px 12px ${SECTION_COLORS[s]}44` } : {}}
              onClick={() => { setActiveSection(s); setSearchQuery(''); setShowFavsOnly(false); }}>
              {SECTION_ICONS[s]} {s === 'TODAS' ? 'Todas' : s.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')}
              {sectionCounts[s] > 0 && <span style={{ opacity:0.75, fontSize:'0.68rem', marginLeft:2 }}>({sectionCounts[s]})</span>}
            </button>
          ))}
          <button className={showFavsOnly ? 'active' : ''} onClick={() => { setShowFavsOnly(!showFavsOnly); setActiveSection('TODAS'); }}
            style={showFavsOnly ? { background:'#fbbf24', color:'#78350f' } : {}}>
            ⭐ Guardados {favorites.length > 0 && `(${favorites.length})`}
          </button>
        </nav>
        <div className="header-meta"><span className="live-dot"></span><span>{news.length} noticias</span></div>
      </header>

      {/* ===== SEARCH ===== */}
      <div className="search-bar" ref={searchRef}>
        <div className="search-input-wrapper">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" placeholder="Busca por titular, fuente o tema (ej: Ebro, Heraldo, vivienda...)"
            value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => { if (searchQuery.length >= 2) setShowSuggestions(true); }} />
          {searchQuery && <button className="search-clear" onClick={() => { setSearchQuery(''); setShowSuggestions(false); }}>✕</button>}
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="search-suggestions">
            {suggestions.map(s => (
              <div key={s.id} className="search-suggestion-item" onClick={() => { setSearchQuery(s.title.substring(0,30)); setShowSuggestions(false); }}>
                <span className="suggestion-cat" style={{ color: SECTION_COLORS[s.category] }}>{SECTION_ICONS[s.category]} {s.category}</span>
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== INFO BAR ===== */}
      <div className="info-bar">
        {prioritySections.map(s => (
          <div key={s} className="stat-chip" onClick={() => { setActiveSection(s); setShowFavsOnly(false); }} style={{ cursor:'pointer', borderColor: SECTION_COLORS[s] + '44' }}>
            {SECTION_ICONS[s]} <strong style={{ color: SECTION_COLORS[s] }}>{sectionCounts[s]}</strong> {s.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')}
          </div>
        ))}
        <div className="stat-chip">🏛️ <strong>{sectionCounts['ZARAGOZA']}</strong> Zgz</div>
        <div className="stat-chip">🚣 <strong>{sectionCounts['RIBERA DEL EBRO']}</strong> Ribera</div>
        {weather && <div className="weather-chip">☀️ Zaragoza • {weather}</div>}
        <div className="stat-chip auto-clean-chip">🧹 Auto-limpieza 10 días</div>
      </div>

      {/* ===== TRENDING ===== */}
      {trending.length > 0 && (
        <div className="trending-bar">
          <span className="trending-label">🔥 Trending:</span>
          {trending.map((t,i) => <span key={i} className="trending-tag" onClick={() => { setSearchQuery(t); setActiveSection('TODAS'); setShowFavsOnly(false); }}>{t}</span>)}
        </div>
      )}

      <main className="main-content">
        {filteredNews.length === 0 ? (
          <div style={{ textAlign:'center', padding:'5rem 0' }}>
            <div style={{ fontSize:'4rem', marginBottom:'1rem' }}>{showFavsOnly ? '⭐' : '🔍'}</div>
            <h2 style={{ fontFamily:'var(--font-sans)', marginBottom:'0.5rem' }}>
              {showFavsOnly ? 'No tienes noticias guardadas todavía' : `Sin resultados para "${searchQuery || activeSection}"`}
            </h2>
            <p style={{ color:'var(--color-text-muted)', marginBottom:'1.5rem' }}>
              {showFavsOnly ? 'Pulsa ☆ en cualquier noticia para guardarla aquí.' : 'Prueba a buscar por: titular, fuente o tema.'}
            </p>
            <button className="source-btn" style={{ padding:'0.6rem 1.25rem' }} onClick={() => { setSearchQuery(''); setActiveSection('TODAS'); setShowFavsOnly(false); }}>🗞️ Ver todas</button>
          </div>
        ) : (
          <>
            {/* ===== HERO ===== */}
            <section className="hero-section">
              {featured && (
                <div className="hero-main-card" onClick={() => setModalItem(featured)}>
                  <img src={featured.image_url || FALLBACK_PICS[0]} alt="" className="ai-retouched-image" loading="lazy" />
                  <div className="hero-overlay">
                    <span className="badge" style={{ background: SECTION_COLORS[featured.category] }}>{SECTION_ICONS[featured.category]} {featured.category}</span>
                    <h2>{featured.title}</h2>
                    <p>{featured.summary}</p>
                    <p className="hero-source">📰 {featured.original_source} • {timeAgo(featured.pub_date)} • 📖 {readingTime(featured.summary)} de lectura</p>
                  </div>
                </div>
              )}
              <div className="side-card">
                <div className="side-card-header">⚡ Flash<span className="badge badge-success" style={{ fontSize:'0.58rem' }}>EN VIVO</span></div>
                {sidebar.map(item => (
                  <div className="side-item" key={item.id} onClick={() => setModalItem(item)}>
                    <span style={{ fontSize:'0.66rem', color: SECTION_COLORS[item.category], fontWeight:700 }}>
                      {SECTION_ICONS[item.category]} {item.category} • {item.original_source}
                    </span>
                    <h3>{item.title}</h3>
                    <div className="side-meta">
                      <span style={{ fontSize:'0.72rem', color:'var(--color-accent)', fontWeight:600 }}>Leer más →</span>
                      <span style={{ fontSize:'0.66rem', color:'var(--color-text-muted)' }}>{timeAgo(item.pub_date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== PRIORITY SECTIONS ===== */}
            {activeSection === 'TODAS' && !showFavsOnly && prioritySections.map(section => {
              const items = news.filter(n => n.category === section && (!featured || n.id !== featured.id) && !sidebar.find(s => s.id === n.id));
              if (items.length === 0) return null;
              return (
                <section key={section}>
                  <div className="section-heading" style={{ borderImage: `linear-gradient(90deg, ${SECTION_COLORS[section]}, transparent) 1` }}>
                    <h2>{SECTION_ICONS[section]} {section.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')}</h2>
                    <span className="section-count">{items.length} artículo{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="news-grid">{items.map((item,idx) => <NewsCard key={item.id} item={item} idx={idx} favorites={favorites} toggleFav={toggleFav} openModal={setModalItem} />)}</div>
                </section>
              );
            })}

            {/* ===== MAIN GRID GROUPED ===== */}
            {Object.keys(groupedGrid).length > 0 && (
              <section>
                <div className="section-heading">
                  <h2>{activeSection === 'TODAS' && !showFavsOnly ? '📰 Todas las Noticias' : `${SECTION_ICONS[activeSection]} ${activeSection}`}</h2>
                  <span className="section-count">{filteredNews.slice(5).length} artículo{filteredNews.slice(5).length !== 1 ? 's' : ''}</span>
                </div>
                {Object.entries(groupedGrid).map(([group, items]) => (
                  <div key={group}>
                    <div className="date-group-label">{group}</div>
                    <div className="news-grid">
                      {items.map((item,idx) => <NewsCard key={item.id} item={item} idx={idx} favorites={favorites} toggleFav={toggleFav} openModal={setModalItem} />)}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <button className={`scroll-top-btn ${showScrollTop ? 'visible' : ''}`} onClick={() => window.scrollTo({top:0,behavior:'smooth'})}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
      </button>

      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <h4>🏠 La Jota News</h4>
            <p>El primer agregador inteligente de noticias para los barrios de <strong style={{color:'#e2e8f0'}}>La Jota</strong>, <strong style={{color:'#e2e8f0'}}>Vadorrey</strong>,
            <strong style={{color:'#e2e8f0'}}> Arrabal</strong>, <strong style={{color:'#e2e8f0'}}>Picarral</strong> y la <strong style={{color:'#e2e8f0'}}>Margen Izquierda</strong> de Zaragoza.</p>
          </div>
          <div>
            <h4>📌 Barrios</h4>
            <ul>{SECTIONS.filter(s => s !== 'TODAS').map(s => <li key={s}><a href="#" onClick={e => { e.preventDefault(); setActiveSection(s); setShowFavsOnly(false); window.scrollTo(0,0); }}>{SECTION_ICONS[s]} {s}</a></li>)}</ul>
          </div>
          <div>
            <h4>🔗 Medios Fuente</h4>
            <ul>
              <li><a href="https://www.heraldo.es" target="_blank" rel="noreferrer">Heraldo de Aragón</a></li>
              <li><a href="https://www.aragondigital.es" target="_blank" rel="noreferrer">Aragón Digital</a></li>
              <li><a href="https://www.20minutos.es/zaragoza/" target="_blank" rel="noreferrer">20 Minutos</a></li>
              <li><a href="https://www.elperiodicodearagon.com" target="_blank" rel="noreferrer">El Periódico de Aragón</a></li>
            </ul>
          </div>
          <div>
            <h4>⚙️ Proyecto</h4>
            <ul><li>🤖 Robot cada 4h</li><li>🧹 Auto-limpieza 10d</li><li>📸 Retoque IA</li><li>📱 Responsive</li><li>⭐ Favoritos locales</li></ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} La Jota News — Proyecto vecinal</span>
          <span>Hecho con ❤️ para la margen izquierda de Zaragoza</span>
        </div>
      </footer>
    </div>
  );
}

// ===== NEWS CARD =====
function NewsCard({ item, idx, favorites, toggleFav, openModal }) {
  const imgSrc = item.image_url || FALLBACK_PICS[idx % FALLBACK_PICS.length];
  const isFav = favorites.includes(item.id);
  return (
    <article className="news-card" style={{ animationDelay: `${idx * 0.04}s` }}>
      <div className="news-card-img-wrapper" onClick={() => openModal(item)} style={{ cursor:'pointer' }}>
        <img src={imgSrc} alt="" className="ai-retouched-image" loading="lazy" />
        <span className="badge badge-dark" style={{ position:'absolute', top:8, left:8, fontSize:'0.6rem', background: SECTION_COLORS[item.category] + 'dd' }}>
          {SECTION_ICONS[item.category]} {item.category}
        </span>
      </div>
      <div className="news-card-content">
        <div className="news-card-meta">
          <span style={{ fontWeight:600, color: SECTION_COLORS[item.category] }}>{item.original_source}</span>
          <span>{timeAgo(item.pub_date)}</span>
        </div>
        <h3 onClick={() => openModal(item)} style={{ cursor:'pointer' }}>{item.title}</h3>
        <p>{item.summary && item.summary.substring(0, 110)}...</p>
        <div className="news-card-footer">
          <a href={item.link} target="_blank" rel="noreferrer" className="source-btn">Fuente ↗</a>
          <span className="reading-time">📖 {readingTime(item.summary)}</span>
          <button className="share-btn" onClick={e => { e.stopPropagation(); toggleFav(item.id); }} title={isFav ? "Quitar de guardados" : "Guardar"}>
            <StarIcon filled={isFav} />
          </button>
          <button className="share-btn" onClick={e => { e.stopPropagation(); handleShare(item); }} title="Compartir">
            <ShareIcon />
          </button>
        </div>
      </div>
    </article>
  );
}

export default App;
