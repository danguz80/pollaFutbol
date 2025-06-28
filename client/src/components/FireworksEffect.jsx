import { useEffect } from "react";

export default function FireworksEffect({ targetSelector }) {
  useEffect(() => {
    let target = null;
    let rect = null;
    if (targetSelector) {
      target = document.querySelector(targetSelector);
      rect = target?.getBoundingClientRect();
    }
    const canvas = document.createElement("canvas");
    if (rect) {
      canvas.style.position = "absolute";
      canvas.style.left = 0;
      canvas.style.top = 0;
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = 10;
      target.appendChild(canvas);
    } else {
      canvas.style.position = "fixed";
      canvas.style.left = 0;
      canvas.style.top = 0;
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = 9999;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext("2d");
    let running = true;

    function randomColor() {
      const colors = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#fff"];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    function drawFirework(x, y) {
      for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const radius = Math.random() * 60 + 40;
        const endX = x + Math.cos(angle) * radius;
        const endY = y + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = randomColor();
        ctx.lineWidth = 2 + Math.random() * 2;
        ctx.stroke();
      }
    }

    function animate() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 3; i++) {
        drawFirework(
          Math.random() * canvas.width * 0.8 + canvas.width * 0.1,
          Math.random() * canvas.height * 0.5 + canvas.height * 0.1
        );
      }
      setTimeout(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }, 600);
      if (running) setTimeout(animate, 1200);
    }
    animate();
    return () => {
      running = false;
      if (rect && target) {
        target.removeChild(canvas);
      } else {
        document.body.removeChild(canvas);
      }
    };
  }, [targetSelector]);
  return null;
}
