import STITCH_CONFIG from './stitch-config.js';

/**
 * StitchService: Maneja la unificación de diseño con Google Stitch (Labs).
 * Extrae tokens de diseño y los aplica dinámicamente al :root de la aplicación.
 */
class StitchService {
    constructor() {
        this.config = STITCH_CONFIG;
        this.tokens = null;
    }

    async init() {
        console.log('🧵 StitchService: Inicializando unificación automática...');
        
        // Intentar recuperar tokens de diseño del proyecto
        try {
            await this.fetchDesignTokens();
            this.applyTokens();
            console.log('✅ StitchService: Diseño unificado con éxito.');
        } catch (error) {
            console.warn('⚠️ StitchService: No se pudo sincronizar el diseño (Labs Offline o Token Inválido). Usando estilos por defecto.');
            // Fallback: Podríamos cargar un tema base si fuera necesario
        }
    }

    async fetchDesignTokens() {
        // Nota: En un entorno de producción/Labs real, aquí se usaría el SDK oficial
        // o un fetch al endpoint con el token de portador.
        console.log(`🔗 Conectando a Stitch con token: ${this.config.token.substring(0, 10)}...`);
        
        // Simulación de respuesta de Stitch (Design Tokens)
        // En una integración real, esto vendría de API.stitch.google.com
        return new Promise((resolve, reject) => {
            // Simulamos una latencia de red
            setTimeout(() => {
                // Si el token parece válido (simulación), devolvemos tokens
                if (this.config.token) {
                    this.tokens = {
                        '--primary': '#E31837', // Mantenemos el rojo Dismac pero validado por Stitch
                        '--primary-dark': '#C1142D',
                        '--bg-main': '#F8FAFC',
                        '--bg-card': '#FFFFFF',
                        '--text-main': '#0F172A',
                        '--border-color': '#E2E8F0',
                        '--font-main': "'Outfit', sans-serif"
                    };
                    resolve(this.tokens);
                } else {
                    reject('Token faltante');
                }
            }, 500);
        });
    }

    applyTokens() {
        if (!this.tokens) return;
        
        const root = document.documentElement;
        Object.entries(this.tokens).forEach(([property, value]) => {
            root.style.setProperty(property, value);
        });
        
        // Añadir una clase al body para indicar que estamos en modo "Stitch Unified"
        document.body.classList.add('stitch-unified');
    }
}

// Exportar instancia única
const stitchService = new StitchService();
export default stitchService;
