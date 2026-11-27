import { render } from 'preact';
import { LocationProvider, Router, Route } from 'preact-iso';
import './styles/base.css';
import './styles/pages.css';
import { TopNav, TabBar, Footer } from './components/Chrome';
import { Home } from './pages/Home';
import { Game } from './pages/Game';
import { Playing, Profile, About } from './pages/Simple';
import { NotFound } from './pages/NotFound';
import { AuthSteam } from './pages/AuthSteam';

function App() {
  return (
    <LocationProvider>
      <div class="ambient" />
      <TopNav />
      <main>
        <Router onRouteChange={() => window.scrollTo(0, 0)}>
          <Route path="/" component={Home} />
          <Route path="/game/:appid" component={Game} />
          <Route path="/playing" component={Playing} />
          <Route path="/profile" component={Profile} />
          <Route path="/about" component={About} />
          <Route path="/auth/steam" component={AuthSteam} />
          <Route default component={NotFound} />
        </Router>
      </main>
      <Footer />
      <TabBar />
    </LocationProvider>
  );
}

render(<App />, document.getElementById('app')!);
