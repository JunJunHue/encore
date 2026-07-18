/**
 * PLACEHOLDER — hand-written to the AMENDED schema (resolutions.md).
 *
 * This file is meant to be GENERATED from the live Supabase project:
 *   npm run gen:types   (supabase gen types typescript --linked > src/lib/database.types.ts)
 *
 * W2 regenerates it in any schema-changing PR. Until then this hand-written
 * version mirrors supabase/migrations/0001_init.sql exactly, including the
 * amendments: comparisons.kind (enum comparison_kind, replaces is_audit),
 * nullable subject_log/opponent_log, profiles.tier_bounds as index cuts,
 * events/venues slug + venue neighborhood/capacity/borough, and the
 * insert_ranked_log RPC with p_session_id.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Shape stored in profiles.tier_bounds — engine index-cut form (resolutions.md A.5). */
export interface TierBounds {
  cuts: [number, number, number, number];
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_seed: string;
          tier_bounds: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_seed?: string;
          tier_bounds?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_seed?: string;
          tier_bounds?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      artists: {
        Row: {
          id: string;
          name: string;
          musicbrainz_id: string | null;
          genres: string[];
          aliases: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          musicbrainz_id?: string | null;
          genres?: string[];
          aliases?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          musicbrainz_id?: string | null;
          genres?: string[];
          aliases?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          id: string;
          slug: string | null;
          name: string;
          city: string;
          neighborhood: string | null;
          borough: string | null;
          capacity: number | null;
          capacity_tier: Database['public']['Enums']['capacity_tier'];
          created_at: string;
        };
        Insert: {
          id?: string;
          slug?: string | null;
          name: string;
          city?: string;
          neighborhood?: string | null;
          borough?: string | null;
          capacity?: number | null;
          capacity_tier: Database['public']['Enums']['capacity_tier'];
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string | null;
          name?: string;
          city?: string;
          neighborhood?: string | null;
          borough?: string | null;
          capacity?: number | null;
          capacity_tier?: Database['public']['Enums']['capacity_tier'];
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          slug: string | null;
          venue_id: string;
          event_date: string;
          title: string;
          primary_genre: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug?: string | null;
          venue_id: string;
          event_date: string;
          title: string;
          primary_genre?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string | null;
          venue_id?: string;
          event_date?: string;
          title?: string;
          primary_genre?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      event_artists: {
        Row: {
          event_id: string;
          artist_id: string;
          billing_order: number;
        };
        Insert: {
          event_id: string;
          artist_id: string;
          billing_order?: number;
        };
        Update: {
          event_id?: string;
          artist_id?: string;
          billing_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'event_artists_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_artists_artist_id_fkey';
            columns: ['artist_id'];
            isOneToOne: false;
            referencedRelation: 'artists';
            referencedColumns: ['id'];
          },
        ];
      };
      set_logs: {
        Row: {
          id: string;
          user_id: string;
          event_id: string;
          latent_score: number;
          rank_pos: number;
          note: string | null;
          moment: Database['public']['Enums']['moment_tag'] | null;
          crew: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_id: string;
          latent_score: number;
          rank_pos: number;
          note?: string | null;
          moment?: Database['public']['Enums']['moment_tag'] | null;
          crew?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_id?: string;
          latent_score?: number;
          rank_pos?: number;
          note?: string | null;
          moment?: Database['public']['Enums']['moment_tag'] | null;
          crew?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'set_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'set_logs_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      comparisons: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          subject_log: string | null;
          opponent_log: string | null;
          outcome: Database['public']['Enums']['comparison_outcome'];
          kind: Database['public']['Enums']['comparison_kind'];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          subject_log?: string | null;
          opponent_log?: string | null;
          outcome: Database['public']['Enums']['comparison_outcome'];
          kind: Database['public']['Enums']['comparison_kind'];
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          subject_log?: string | null;
          opponent_log?: string | null;
          outcome?: Database['public']['Enums']['comparison_outcome'];
          kind?: Database['public']['Enums']['comparison_kind'];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comparisons_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comparisons_subject_log_fkey';
            columns: ['subject_log'];
            isOneToOne: false;
            referencedRelation: 'set_logs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comparisons_opponent_log_fkey';
            columns: ['opponent_log'];
            isOneToOne: false;
            referencedRelation: 'set_logs';
            referencedColumns: ['id'];
          },
        ];
      };
      follows: {
        Row: {
          follower_id: string;
          followee_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          followee_id: string;
          created_at?: string;
        };
        Update: {
          follower_id?: string;
          followee_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_followee_id_fkey';
            columns: ['followee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      /** Service-role only (RLS enabled, no policies) — demo reset fixture. */
      demo_ladder_fixture: {
        Row: {
          set_log_id: string;
          rank_pos: number;
          latent_score: number;
        };
        Insert: {
          set_log_id: string;
          rank_pos: number;
          latent_score: number;
        };
        Update: {
          set_log_id?: string;
          rank_pos?: number;
          latent_score?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      artist_ladder: {
        Row: {
          user_id: string;
          artist_id: string;
          name: string;
          score: number;
          show_count: number;
          rank_pos: number;
        };
        Relationships: [];
      };
      venue_ladder: {
        Row: {
          user_id: string;
          venue_id: string;
          name: string;
          capacity_tier: Database['public']['Enums']['capacity_tier'];
          score: number;
          show_count: number;
          rank_pos: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      login_with_name: {
        Args: { p_name: string; p_pin: string };
        Returns: undefined;
      };
      set_pin: {
        Args: { p_pin: string };
        Returns: undefined;
      };
      insert_ranked_log: {
        Args: {
          p_event_id: string;
          p_score: number;
          p_rank: number;
          p_session_id: string;
          /** [{ opponent_log, outcome, kind, created_at }] */
          p_comparisons: Json;
          /** [{ log_id, latent_score }] */
          p_score_updates: Json;
        };
        Returns: Database['public']['Tables']['set_logs']['Row'];
      };
      shared_shows: {
        Args: {
          user_a: string;
          user_b: string;
        };
        Returns: {
          event_id: string;
          title: string;
          event_date: string;
          venue_name: string;
          a_rank: number;
          b_rank: number;
          a_score: number;
          b_score: number;
          a_moment: Database['public']['Enums']['moment_tag'] | null;
          b_moment: Database['public']['Enums']['moment_tag'] | null;
        }[];
      };
    };
    Enums: {
      capacity_tier: 'club' | 'theater' | 'arena' | 'stadium';
      moment_tag: 'the_drop' | 'the_encore' | 'the_crowd' | 'the_visuals' | 'the_guest_appearance';
      comparison_outcome: 'a_wins' | 'b_wins' | 'skipped';
      comparison_kind: 'insertion' | 'audit' | 'backfill';
    };
    CompositeTypes: Record<string, never>;
  };
}

// ---------- convenience aliases ----------

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type CapacityTier = Enums<'capacity_tier'>;
export type MomentTag = Enums<'moment_tag'>;
export type ComparisonOutcome = Enums<'comparison_outcome'>;
export type ComparisonKind = Enums<'comparison_kind'>;
