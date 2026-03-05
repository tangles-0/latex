import { LightSunglasses } from '@energiz3r/icon-library/Icons/Light/LightSunglasses'; // light theme (for psychopaths)
import { LightMoon } from '@energiz3r/icon-library/Icons/Light/LightMoon'; // dark theme
import { LightBook } from '@energiz3r/icon-library/Icons/Light/LightBook'; // author theme
import { LightWhale } from '@energiz3r/icon-library/Icons/Light/LightWhale'; // dark blues theme
import { LightGamepad } from '@energiz3r/icon-library/Icons/Light/LightGamepad'; // retro theme
import { LightRadiation } from '@energiz3r/icon-library/Icons/Light/LightRadiation'; // neon-green theme
import { LightMicrochip } from '@energiz3r/icon-library/Icons/Light/LightMicrochip'; // cyber theme
import { LightRaindrops } from '@energiz3r/icon-library/Icons/Light/LightRaindrops'; // blood theme
import { LightRobot } from '@energiz3r/icon-library/Icons/Light/LightRobot'; // cyan theme
import { LightPager } from '@energiz3r/icon-library/Icons/Light/LightPager';

// import { LightSeedling } from '@energiz3r/icon-library/Icons/Light/LightSeedling';  // forest (greens) theme
// import { LightCrow } from '@energiz3r/icon-library/Icons/Light/LightCrow'; // sky (light blues) theme
// import { LightRainbow } from '@energiz3r/icon-library/Icons/Light/LightRainbow'; // rainbow colors theme
// import { LightTransgenderAlt } from '@energiz3r/icon-library/Icons/Light/LightTransgenderAlt'; // trans flag colors theme
// import { LightHeart } from '@energiz3r/icon-library/Icons/Light/LightHeart'; // pinks theme
// import { LightJackOLantern } from '@energiz3r/icon-library/Icons/Light/LightJackOLantern'; // 'pumpkin' theme
// import { LightGhost } from '@energiz3r/icon-library/Icons/Light/LightGhost';
// import { LightBiohazard } from '@energiz3r/icon-library/Icons/Light/LightBiohazard';
// import { LightSkull } from '@energiz3r/icon-library/Icons/Light/LightSkull';

export const THEMES = ["dark", "light", "author", "depth", "neon-green", "retro", "cyber", "blood", "robot", "crt"] as const;
export const THEME_SET = new Set<string>(THEMES);

export const ThemeIcon = ({ theme }: { theme: string }) => {
  const iconColor = "currentColor";
  const size = 20;

  switch (theme) {
    case "default":
      return (
        <LightMoon width={size} height={size} fill={iconColor} />
      );
    case "dark":
      return (
        <LightMoon width={size} height={size} fill={iconColor} />
      );
    case "light":
      return (
        <LightSunglasses width={size} height={size} fill={iconColor} />
      );
    case "depth":
      return (
        <LightWhale width={size} height={size} fill={iconColor} />
      );
    case "author":
      return (
        <LightBook width={size} height={size} fill={iconColor} />
      );
    case "retro":
      return (
        <LightGamepad width={size} height={size} fill={iconColor} />
      );
    case "cyber":
      return (
        <LightMicrochip width={size} height={size} fill={iconColor} />
      );
    case "blood":
      return (
        <LightRaindrops width={size} height={size} fill={iconColor} />
      );
    case "neon-green":
      return (
        <LightRadiation width={size} height={size} fill={iconColor} />
      );
    case "robot":
      return (
        <LightRobot width={size} height={size} fill={iconColor} />
      );
    case "crt":
      return (
        <LightPager width={size} height={size} fill={iconColor} />
      );
    default:
      return null;
  }
}