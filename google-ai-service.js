import GOOGLE_AI_CONFIG from './google-ai-config.js';

/**
 * GoogleAIService: Maneja la interacción con los modelos de IA de Google (Gemini).
 */
class GoogleAIService {
    constructor() {
        this.config = GOOGLE_AI_CONFIG;
    }

    /**
     * Genera una respuesta basada en un prompt.
     * @param {string} prompt - El texto a enviar a la IA.
     * @returns {Promise<string>} - La respuesta de la IA.
     */
    async generateContent(prompt) {
        if (!this.config.apiKey || this.config.apiKey === 'PONER_TU_API_KEY_AQUI') {
            console.error('❌ Google AI: API Key no configurada en google-ai-config.js');
            throw new Error('API Key no configurada');
        }

        const url = `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('❌ Google AI Error Status:', response.status, errorData);
                throw new Error(errorData.error?.message || 'Error en la petición a Google AI');
            }

            const data = await response.json();

            // Estructura de respuesta de Gemini: data.candidates[0].content.parts[0].text
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                console.warn('⚠️ Google AI: Respuesta vacía o inesperada.', data);
                return 'No se pudo generar una respuesta.';
            }
        } catch (error) {
            console.error('❌ Google AI Exception:', error);
            throw error;
        }
    }
}

// Exportar instancia única
const googleAiService = new GoogleAIService();
export default googleAiService;
