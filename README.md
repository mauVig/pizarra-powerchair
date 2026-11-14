# Pizarra táctica · Powerchair Football

Pizarra web para practicar posiciones en cancha de **Powerchair Football** (fútbol en silla de ruedas motorizada). No es un juego: sirve para armar y explicar jugadas paso a paso.

## Qué hace

- **Cancha a escala real** según las Reglas de Juego FIPFA 2019: 28 × 15 m (también 30 × 18 y 25 × 14), área de gol de 8 × 5 m, arco de 6 m, punto penal a 3,5 m y córner de 1 m.
- **8 sillas** (3 jugadores de campo + 1 arquero por equipo), con camisetas de colores distintos para el arquero. Se arrastran para moverlas y se giran con el círculo blanco, la rueda del mouse o las teclas `Q` / `E`.
- **Jugadas por pasos**: cada jugada tiene varios pasos y "Reproducir" anima el movimiento de todas las sillas.
- **Reglamento en vivo (Regla 11)**: avisa cuando hay un posible *2 contra 1* (dos jugadores del mismo equipo y un rival a menos de 3 m del balón) o 3 jugadores en su propia área.
- **Guardado automático** en el navegador, más **Guardar jugadas** / **Subir archivo** para pasarlas en un `.json`.

## Correrla en tu computadora

Requisito: [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm run dev
```

Se abre en http://localhost:5173. En Windows también podés hacer doble clic en `iniciar.bat`.

Para generar la versión para publicar en un hosting:

```bash
npm run build
```

Queda en la carpeta `dist/`.

## Estructura

```
src/
  App.jsx      Interfaz: cancha, sillas, pasos, paneles y ventanas de archivos
  model.js     Medidas FIPFA, reglas de ubicación, animación y lectura de archivos de jugadas
  styles.css   Estilos
  main.jsx     Punto de entrada (con pantalla de error)
```

## Dónde se guardan las jugadas

En el `localStorage` del navegador, bajo la clave `pcf-pizarra-v1`. Cada navegador (y cada puerto: `localhost:5173` no es lo mismo que `localhost:5174`) guarda por separado. Para tener un respaldo o pasarlas a otra persona, usá **Guardar jugadas**.
