export const PRICE_RANGE_LABELS: Record<string, string> = {
    low: 'Económico',
    medium: 'Medio',
    high: 'Alto',
    premium: 'Premium',
};

export const PAYMENT_METHOD_OPTIONS = [
    'Efectivo',
    'Tarjeta',
    'Contactless',
    'Bizum',
    'Apple Pay',
    'Google Pay',
    'PayPal',
    'Transferencia',
    'Cheque gourmet',
    'Ticket Restaurant',
    'Sodexo',
    'American Express',
    'Visa',
    'Mastercard',
    'Pago online',
    'Pago en app',
    'Contra reembolso',
];

export const BUSINESS_SERVICE_OPTIONS = [
    'Comer en local',
    'Terraza',
    'Reservas',
    'Para llevar',
    'Entrega a domicilio',
    'Recogida en local',
    'Pedidos online',
    'Menú del día',
    'Menú infantil',
    'Opciones vegetarianas',
    'Opciones veganas',
    'Sin gluten',
    'Sin lactosa',
    'Desayunos',
    'Brunch',
    'Comidas',
    'Cenas',
    'Copas',
    'Café',
    'Cócteles',
    'Vino',
    'Cerveza',
    'Música en directo',
    'Eventos privados',
    'Catering',
    'Cumpleaños',
    'Apto para grupos',
    'Apto para familias',
    'Pet friendly',
    'WiFi',
    'Enchufes',
    'Aire acondicionado',
    'Calefacción',
    'Televisión',
    'Parking',
    'Parking cercano',
    'Aparcacoches',
    'Acceso sin escalón',
    'Baño adaptado',
    'Tronas',
    'Cambiador para bebés',
    'Pago en mesa',
    'Zona fumadores',
    'Zona tranquila',
    'Vistas',
    'Azotea',
];

export const ALLERGEN_OPTIONS = [
    'Gluten',
    'Lactosa',
    'Frutos secos',
    'Cacahuetes',
    'Huevo',
    'Soja',
    'Pescado',
    'Crustáceos',
    'Moluscos',
    'Apio',
    'Mostaza',
    'Sésamo',
    'Sulfitos',
    'Altramuces',
];

export const CROSS_CONTAMINATION_LABELS: Record<string, string> = {
    unknown: 'No indicado',
    possible: 'Puede haber contaminación cruzada',
    controlled: 'Protocolo para reducir contaminación cruzada',
    dedicated: 'Zona o preparación separada sin gluten',
};

export const DELIVERY_PROVIDER_LABELS: Record<string, string> = {
    glovo: 'Glovo',
    justeat: 'Just Eat',
    ubereats: 'Uber Eats',
    deliveroo: 'Deliveroo',
    deliverect: 'Deliverect',
    own: 'Web propia',
    whatsapp: 'WhatsApp',
    custom: 'Otro',
};

export const DELIVERY_PROVIDER_OPTIONS = Object.entries(DELIVERY_PROVIDER_LABELS).map(([value, label]) => ({
    value,
    label,
}));

export const PET_POLICY_LABELS: Record<string, string> = {
    unknown: 'No indicado',
    allowed: 'Mascotas admitidas',
    dogs_only: 'Perros admitidos',
    terrace_only: 'Solo en terraza',
    assistance_only: 'Solo perros de asistencia',
    not_allowed: 'No admite mascotas',
};

export const PET_RESTRICTION_OPTIONS = [
    'Solo perros pequeÃ±os',
    'Solo con correa',
    'No se permite subir a sillas',
    'Evitar horas de mucha afluencia',
    'Consultar antes de reservar',
    'TransportÃ­n recomendado',
    'Puede variar segÃºn zona',
];
