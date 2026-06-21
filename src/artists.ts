import type { Market, MaxInt } from '@spotify/web-api-ts-sdk';
import { z } from 'zod';
import type { SpotifyHandlerExtra, tool } from './types.js';
import { formatDuration, handleSpotifyRequest } from './utils.js';

const getArtist: tool<{
  artistIds: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString>]>;
}> = {
  name: 'getArtist',
  description:
    'Get detailed information about one or more artists by their Spotify IDs',
  schema: {
    artistIds: z
      .union([z.string(), z.array(z.string()).max(50)])
      .describe('A single artist ID or array of artist IDs (max 50)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { artistIds } = args;
    const ids = Array.isArray(artistIds) ? artistIds : [artistIds];

    if (ids.length === 0) {
      return {
        content: [{ type: 'text', text: 'Error: No artist IDs provided' }],
      };
    }

    try {
      const artists = await handleSpotifyRequest(async (spotifyApi) => {
        return ids.length === 1
          ? [await spotifyApi.artists.get(ids[0])]
          : await spotifyApi.artists.get(ids);
      });

      if (artists.length === 0) {
        return {
          content: [
            { type: 'text', text: 'No artists found for the provided IDs' },
          ],
        };
      }

      if (artists.length === 1) {
        const artist = artists[0];
        const genres =
          artist.genres && artist.genres.length > 0
            ? artist.genres.join(', ')
            : 'N/A';
        const followers = artist.followers?.total ?? 0;

        return {
          content: [
            {
              type: 'text',
              text: `# Artist Details\n\n**Name**: ${artist.name}\n**Genres**: ${genres}\n**Followers**: ${followers.toLocaleString()}\n**Popularity**: ${artist.popularity}\n**ID**: ${artist.id}\n**URL**: ${artist.external_urls?.spotify ?? ''}`,
            },
          ],
        };
      }

      const formattedArtists = artists
        .map((artist, i) => {
          if (!artist) return `${i + 1}. [Artist not found]`;
          const followers = artist.followers?.total ?? 0;
          return `${i + 1}. ${artist.name} (${followers.toLocaleString()} followers) - ID: ${artist.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Multiple Artists\n\n${formattedArtists}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting artists: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const getArtistAlbums: tool<{
  artistId: z.ZodString;
  includeGroups: z.ZodOptional<
    z.ZodArray<z.ZodEnum<['album', 'single', 'appears_on', 'compilation']>>
  >;
  limit: z.ZodOptional<z.ZodNumber>;
  offset: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getArtistAlbums',
  description: "Get an artist's albums with pagination support",
  schema: {
    artistId: z.string().describe('The Spotify ID of the artist'),
    includeGroups: z
      .array(z.enum(['album', 'single', 'appears_on', 'compilation']))
      .optional()
      .describe(
        'Filter by album types to include (album, single, appears_on, compilation)',
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of albums to return (1-50)'),
    offset: z
      .number()
      .min(0)
      .optional()
      .describe('Offset for pagination (0-based index)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { artistId, includeGroups, limit = 20, offset = 0 } = args;

    try {
      const albums = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.artists.albums(
          artistId,
          includeGroups?.join(','),
          undefined,
          limit as MaxInt<50>,
          offset,
        );
      });

      if (albums.items.length === 0) {
        return {
          content: [{ type: 'text', text: 'No albums found for this artist' }],
        };
      }

      const formattedAlbums = albums.items
        .map((album, i) => {
          const artists = album.artists.map((a) => a.name).join(', ');
          return `${offset + i + 1}. "${album.name}" by ${artists} (${album.release_date}) - ${album.album_type}, ${album.total_tracks} tracks - ID: ${album.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Artist Albums (${offset + 1}-${offset + albums.items.length} of ${albums.total})\n\n${formattedAlbums}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting artist albums: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const getArtistTopTracks: tool<{
  artistId: z.ZodString;
  market: z.ZodOptional<z.ZodString>;
}> = {
  name: 'getArtistTopTracks',
  description: "Get an artist's top tracks in a given market",
  schema: {
    artistId: z.string().describe('The Spotify ID of the artist'),
    market: z
      .string()
      .length(2)
      .optional()
      .describe('An ISO 3166-1 alpha-2 country code (e.g. US). Defaults to US'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { artistId, market = 'US' } = args;

    try {
      const result = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.artists.topTracks(artistId, market as Market);
      });

      if (!result.tracks || result.tracks.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No top tracks found for this artist in market ${market}`,
            },
          ],
        };
      }

      const formattedTracks = result.tracks
        .map((track, i) => {
          const artists = track.artists.map((a) => a.name).join(', ');
          const duration = formatDuration(track.duration_ms);
          return `${i + 1}. "${track.name}" by ${artists} (${duration}) - ID: ${track.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Top Tracks (market: ${market})\n\n${formattedTracks}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting artist top tracks: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

export const artistTools = [getArtist, getArtistAlbums, getArtistTopTracks];
