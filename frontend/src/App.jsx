import { ThemeProvider } from './app/ThemeContext.jsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx';
import { PublicEntryRouter } from './routes/PublicEntryRouter.jsx';
import { useFieldNavigation } from './hooks/useFieldNavigation.js';

export default function App() {
  useFieldNavigation();
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <PublicEntryRouter />
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
