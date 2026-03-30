// Helper para obtener el logo de un equipo de Sudamericana
export const getLogoEquipo = (nombreEquipo) => {
  if (!nombreEquipo) return null;
  
  // Extraer país entre paréntesis si existe (ej: "Palmeiras (BRA)" -> país = "BRA")
  const matchPais = nombreEquipo.match(/\(([A-Z]{3})\)\s*$/i);
  const pais = matchPais ? matchPais[1].toUpperCase() : null;
  
  // Eliminar país entre paréntesis (ej: "Palmeiras (BRA)" -> "Palmeiras")
  const nombreSinPais = nombreEquipo.replace(/\s*\([A-Z]{3}\)\s*$/i, '').trim();
  
  // Normalizar nombre del equipo (sin espacios, sin tildes, minúsculas)
  const nombreNormalizado = nombreSinPais
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Eliminar tildes
    .replace(/[\u2018\u2019]/g, "'") // Normalizar apóstrofes tipográficos → normal
    .replace(/\s+/g, ''); // Eliminar espacios
  
  // Casos especiales: equipos con mismo nombre pero diferentes países
  if (nombreNormalizado === 'independiente') {
    if (pais === 'BOL') return '/copa_sudamericana_logos_equipos/INDEPENDIENTE_PETROLERO.png';
    if (pais === 'ARG') return '/copa_sudamericana_logos_equipos/INDEPENDIENTE.png';
  }
  
  // Mapeo de nombres de equipos a nombres de archivos
  const mapeoLogos = {
    // Argentina
    'bocajuniors': 'Boca_juniors.png',
    'argentinosjuniors': 'Argentinos_Juniors.png',
    'independiente': 'INDEPENDIENTE.png',
    'independienterivadavia': 'Independiente_Rivadavia.png',
    'lanus': 'Lanus.png',
    'platense': 'Platense.png',
    'racing': 'Racing.png',
    'riverplate': 'RIVER_PLATE.png',
    'rosariocentral': 'rosario_central.png',
    'sanlorenzo': 'SAN_LORENZO.png',
    'tigre': 'TIGRE.png',
    'barracascentral': 'BARRACAS_CENTRAL.png',
    'deportivoriestra': 'DEPORTIVO_RIESTRA.png',
    'estudiantesdelaplata': 'Estudiantes_de_La_Plata.png',
    'estudianteslp': 'Estudiantes_de_La_Plata.png',
    
    // Brasil
    'atleticomineiro': 'ATLETICO_MINEIRO.png',
    'atlmineiro': 'ATLETICO_MINEIRO.png',
    'bahia': 'bahia.png',
    'botafogo': 'BOTAFOGO.png',
    'bragantino': 'BRAGANTINO.png',
    'rbbragantino': 'BRAGANTINO.png',
    'corinthians': 'corinthians.png',
    'cruzeiro': 'Cruzeiro.png',
    'flamengo': 'Flamengo.png',
    'fluminense': 'Fluminense.png',
    'fortaleza': 'Fortaleza.png',
    'gremio': 'GREMIO.png',
    'mirassol': 'Mirassol.png',
    'palmeiras': 'Palmeiras.png',
    'santos': 'SANTOS.png',
    'saopaulo': 'SAO_PAULO.png',
    'vascodagama': 'VASCO_DA_GAMA.png',
    
    // Bolivia
    'bolivar': 'bolivar.png',
    'blooming': 'BLOOMING.png',
    'alwaysready': 'Always_Ready.png',
    'independientepetrolero': 'INDEPENDIENTE_PETROLERO.png',
    'nacionalpotosi': 'Nacional_Potosí.png',
    'thestrongest': 'The_Strongest.png',
    
    // Chile
    'audaxitaliano': 'AUDAX_ITALIANO.png',
    'colo-colo': 'colo-colo.png',
    'colocolo': 'colo-colo.png',
    'coquimbounido': 'coquimbo.png',
    'huachipato': 'huachipato.png',
    "o'higgins": 'ohiggins.webp',
    'ohiggins': 'ohiggins.webp',
    'palestino': 'PALESTINO.png',
    'recoleta': 'RECOLETA.png',
    'universidadcatolica': 'uc.png',
    'u.catolica': 'uc.png',
    'universidaddechile': 'udechile.png',
    'udechile': 'udechile.png',
    'u.dechile': 'udechile.png',
    
    // Colombia
    'americadecali': 'AMERICA_DE_CALI.png',
    'atleticobucaramanga': 'AtléticoBucaramanga.png',
    'independientemedellin': 'ind_medellin.png',
    'indmedellin': 'ind_medellin.png',
    'junior': 'junior_barranquilla.png',
    'juniorbarranquilla': 'junior_barranquilla.png',
    'millonarios': 'MILLONARIOS.png',
    'santafe': 'Santa_Fe.png',
    'tolima': 'Tolima.png',
    'deportestolima': 'Tolima.png',
    
    // Ecuador
    'barcelona': 'Barcelona_SC.png',
    'barcelonasc': 'Barcelona_SC.png',
    'cienciano': 'CIENCIANO.png',
    'cuenca': 'CUENCA.png',
    'deportivocuenca': 'CUENCA.png',
    'independientedelvalle': 'Independiente_del_Valle.png',
    'ldu': 'LDU.png',
    'l.d.u.quito': 'LDU.png',
    'ldquito': 'LDU.png',
    'ligadequito': 'LDU.png',
    'macara': 'MACARA.png',
    'universidadcatolicaecuador': 'Universidad_Católica_Ecuador.png',
    
    // Paraguay
    '2demayo': '2demayo.png',
    'cerroporteno': 'Cerro_Porteno.png',
    'guarani': 'Guaraní.png',
    'libertad': 'libertad.png',
    'olimpia': 'OLIMPIA.png',
    
    // Perú
    'alianzaatletico': 'ALIANZA_ATLETICO.png',
    'alianzalima': 'Alianza_Lima.png',
    'cusco': 'cusco.png',
    'cuscofc': 'cusco.png',
    'sportingcristal': 'Sporting_Cristal.png',
    'universitario': 'Universitario.png',
    
    // Uruguay
    'atleticojuventud': 'ATLÉTICO_JUVENTUD.png',
    'bostonriver': 'ATLETICO_BOSTON_RIVER.png',
    'atleticoriver': 'ATLETICO_BOSTON_RIVER.png',
    'juventud': 'Juventud_de_Las_Piedras.png',
    'juventuddelaspiedras': 'Juventud_de_Las_Piedras.png',
    'liverpool': 'liverpool.png',
    'liverpoolfc': 'liverpool.png',
    'montevideocitytorque': 'MONTEVIDEO_CITY_TORQUE.png',
    'citytorque': 'MONTEVIDEO_CITY_TORQUE.png',
    'nacional': 'Nacional.png',
    'penarol': 'Penarol.png',
    
    // Venezuela
    'caracas': 'CARACAS.png',
    'caracasfc': 'CARACAS.png',
    'carabobo': 'carabobo.png',
    'carabobofc': 'carabobo.png',
    'deportivotachira': 'tachira.png',
    'deportivolaguaira': 'depor_la_guauria.png',
    'puertocabello': 'PUERTO_CABELLO.png',
    'academiapuertocabello': 'PUERTO_CABELLO.png',
    'universidadcentral': 'UNIVERSIDAD_CENTRAL.png',
    'universidadcentraldevenezuela': 'ucentral_ven.png',
  };
  
  const nombreArchivo = mapeoLogos[nombreNormalizado];
  
  if (nombreArchivo) {
    return `/copa_sudamericana_logos_equipos/${nombreArchivo}`;
  }
  
  return null;
};

// Componente de logo con fallback
export const LogoEquipo = ({ nombre, className = "", style = {} }) => {
  const logoUrl = getLogoEquipo(nombre);
  
  if (!logoUrl) {
    return null;
  }
  
  return (
    <img
      src={logoUrl}
      alt={`Logo ${nombre}`}
      className={className}
      style={{
        width: '30px',
        height: '30px',
        objectFit: 'contain',
        marginRight: '8px',
        ...style
      }}
      onError={(e) => {
        e.target.style.display = 'none';
      }}
    />
  );
};
