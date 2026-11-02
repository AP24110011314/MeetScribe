import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App Component', () => {
  it('renders MeetScribe heading', async () => {
    render(<App />);
    expect(await screen.findByText('MeetScribe')).toBeInTheDocument();
  });
});

