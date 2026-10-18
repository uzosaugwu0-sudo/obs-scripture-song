import { describe, it, expect } from 'vitest';
import { buildLyricsFile, isLyricsFile, parseLyricsFile, LYRICS_HEADER, LYRICS_FILENAME } from '../../src/songs/lyrics-file.js';

const strip = (songs) => songs.map(({ title, slides }) => ({ title, altTitle: null, slides }));

describe('lyrics file', () => {
  it('names the file lyrics.txt and starts with the header', () => {
    expect(LYRICS_FILENAME).toBe('lyrics.txt');
    expect(buildLyricsFile([]).startsWith(LYRICS_HEADER + '\n')).toBe(true);
  });

  it('renders a readable file for ordinary songs', () => {
    const text = buildLyricsFile([
      { title: 'Amazing Grace', slides: ['Amazing grace\nhow sweet', 'Through many dangers'] },
      { title: 'How Great', slides: ['Then sings my soul'] },
    ]);
    expect(text).toBe(
      '#OBS-LYRICS-V1\n\nAmazing Grace\n\nAmazing grace\nhow sweet\n\nThrough many dangers\n\n==========\n\nHow Great\n\nThen sings my soul\n');
  });

  it('round-trips ordinary songs', () => {
    const songs = [
      { title: 'Amazing Grace', slides: ['Amazing grace\nhow sweet', 'Through many dangers'] },
      { title: 'How Great', slides: ['Then sings my soul'] },
    ];
    expect(parseLyricsFile(buildLyricsFile(songs))).toEqual(strip(songs));
  });

  it('round-trips lyrics that look like file syntax', () => {
    const songs = [{
      title: 'A/B: "x"',
      slides: [
        'line one\n\nline after a blank',
        '',
        '==========',
        '\\starts with a backslash',
        '  indented  ',
        'ends with a blank\n',
      ],
    }];
    expect(parseLyricsFile(buildLyricsFile(songs))).toEqual(strip(songs));
  });

  it('keeps songs that have no slides, and an empty library', () => {
    expect(parseLyricsFile(buildLyricsFile([{ title: 'Empty', slides: [] }]))).toEqual([{ title: 'Empty', altTitle: null, slides: [] }]);
    expect(parseLyricsFile(buildLyricsFile([]))).toEqual([]);
  });

  it('gives untitled songs a title and flattens multi-line titles', () => {
    const [a, b] = parseLyricsFile(buildLyricsFile([{ title: '   ', slides: ['x'] }, { title: 'Two\nLines', slides: ['y'] }]));
    expect(a.title).toBe('Untitled');
    expect(b.title).toBe('Two Lines');
  });

  it('normalises Windows line endings and a BOM', () => {
    const text = '﻿' + buildLyricsFile([{ title: 'T', slides: ['a\nb'] }]).replace(/\n/g, '\r\n');
    expect(isLyricsFile(text)).toBe(true);
    expect(parseLyricsFile(text)).toEqual([{ title: 'T', altTitle: null, slides: ['a\nb'] }]);
  });

  it('does not mistake an ordinary lyrics text file for a lyrics.txt', () => {
    expect(isLyricsFile('Amazing Grace\n\nline\n---\nnotes')).toBe(false);
  });
});
