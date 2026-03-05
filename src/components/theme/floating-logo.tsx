"use client";

import { useEffect, useState } from "react";

export const FloatingLogo = () => {
  const [numClicks, setNumClicks] = useState(0);
  useEffect(() => {
    if (numClicks == 5) {      
      setTimeout(() => {
        setNumClicks(0);
      }, 1000);
    }
  }, [numClicks]);
  return (
    <div className={`fixed bottom-0 right-0 z-10 z-5 ${numClicks > 4 ? "easter-egg" : ""}`}
      onClick={() => {
        setNumClicks(numClicks + 1);
      }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/latex-logo.png" alt="LaTeX logo" width="48" className={`latex-logo ${numClicks > 4 ? "easter-egg" : ""}`} />
    </div>
  );
};