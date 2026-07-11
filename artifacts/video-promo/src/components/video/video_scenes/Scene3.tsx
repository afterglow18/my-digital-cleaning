import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SceneContainer, springSnappy, springBouncy } from './Shared';

export const Scene3 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // text 1
      setTimeout(() => setPhase(2), 1600), // exit lookbook, show tagline
      setTimeout(() => setPhase(3), 2000), // show app name
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <SceneContainer style={{ backgroundColor: 'var(--color-brand-cream)' }}>
      {/* Lookbook Section */}
      <motion.div
        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center pt-[5cqh]"
        initial={{ opacity: 1, scale: 1 }}
        animate={phase >= 2 ? { opacity: 0, scale: 0.8 } : { opacity: 1, scale: 1 }}
        transition={springSnappy}
      >
        <motion.div
          className="relative w-[75cqw] h-[65cqh] rounded-[2cqw] overflow-hidden shadow-2xl border-[3px] border-black"
          initial={{ scale: 0.8, y: 100, opacity: 0, rotateZ: 5 }}
          animate={{ scale: 1, y: 0, opacity: 1, rotateZ: 0 }}
          transition={{ ...springSnappy, delay: 0.2 }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/screen_lookbook.jpeg`}
            className="w-full h-full object-cover object-top"
          />
        </motion.div>
        
        <motion.div
          className="absolute top-[12cqh] left-[5cqw] text-black font-display font-black text-[6cqh] uppercase leading-[0.9] transform -rotate-3 text-left"
          style={{ color: 'var(--color-brand-pink)', textShadow: '2px 2px 0 #1A1A1A' }}
          initial={{ scale: 0 }}
          animate={phase >= 1 ? { scale: 1 } : { scale: 0 }}
          transition={springBouncy}
        >
          SAVE<br/>YOUR<br/>LOOKS
        </motion.div>
      </motion.div>

      {/* Final Tagline Section */}
      <motion.div
        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center z-20"
        style={{ backgroundColor: 'var(--color-brand-yellow)' }}
        initial={{ clipPath: 'circle(0% at 50% 50%)' }}
        animate={phase >= 2 ? { clipPath: 'circle(150% at 50% 50%)' } : { clipPath: 'circle(0% at 50% 50%)' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--color-brand-cream)_0%,transparent_70%)] opacity-30 mix-blend-overlay" />
        
        <motion.h2
          className="font-display font-black text-[6cqh] text-center uppercase tracking-tight leading-[1.1] mb-[4cqh]"
          style={{ color: 'var(--color-brand-black)' }}
          initial={{ y: 50, opacity: 0 }}
          animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
          transition={{ ...springSnappy, delay: 0.2 }}
        >
          "As If!<br/>
          <span className="text-[7cqh]" style={{ color: 'var(--color-brand-pink)', textShadow: '3px 3px 0 #1A1A1A' }}>Your Outfits,</span><br/>
          Sorted."
        </motion.h2>

        <motion.div
          className="bg-black text-white px-[8cqw] py-[2.5cqh] rounded-[2cqw] border-[4px] border-brand-pink shadow-[8px_8px_0px_0px_rgba(255,179,198,1)]"
          style={{ backgroundColor: 'var(--color-brand-black)', borderColor: 'var(--color-brand-pink)' }}
          initial={{ scale: 0 }}
          animate={phase >= 3 ? { scale: 1 } : { scale: 0 }}
          transition={springBouncy}
        >
          <span className="font-body font-bold text-[3.5cqh] tracking-widest uppercase">My Digital Closet</span>
        </motion.div>
      </motion.div>
    </SceneContainer>
  );
};
