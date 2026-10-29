import { LineFieldBackground } from "@/components/backgrounds/LineFieldBackground";

/**
 * Startup splash: logo inside two rotating rings (adapted from 21st.dev kokonutd "Loader").
 * Styles live in index.html so the identical splash is already animating before the JS
 * bundle loads; React keeps showing it until auth, company and landing route are resolved,
 * and adds the interactive line field (same as the login screen) once JS is running.
 */

export function SplashScreen({ message = "טוען את המערכת…" }: { message?: string }) {
  return (
    <div className="boot-splash" role="status" aria-live="polite" aria-busy="true">
      <LineFieldBackground />
      <div className="boot-splash__mark" aria-hidden="true">
        <div className="boot-splash__ring boot-splash__ring--outer" />
        <div className="boot-splash__ring boot-splash__ring--inner" />
        <img className="boot-splash__logo" src="/logo.svg" alt="" />
      </div>
      <div className="boot-splash__text">
        <p className="boot-splash__title">תפעול 360</p>
        <p className="boot-splash__subtitle">{message}</p>
      </div>
    </div>
  );
}
