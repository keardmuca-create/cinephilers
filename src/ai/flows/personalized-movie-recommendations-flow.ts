'use server';
/**
 * @fileOverview A Genkit flow for generating personalized movie and show recommendations.
 *
 * - personalizeMovieRecommendations - A function that generates personalized movie/show recommendations.
 * - PersonalizeMovieRecommendationsInput - The input type for the personalizeMovieRecommendations function.
 * - PersonalizeMovieRecommendationsOutput - The return type for the personalizeMovieRecommendations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Input Schema
const PersonalizeMovieRecommendationsInputSchema = z.object({
  userId: z.string().describe("The ID of the user for whom to generate recommendations."),
  watchedHistory: z.array(z.object({
    title: z.string().describe("The title of the movie or show."),
    genre: z.string().describe("The primary genre of the movie or show."),
    rating: z.number().min(1).max(5).optional().describe("The user's rating for the movie or show, if available."),
  })).describe("A list of movies and shows the user has watched, along with their ratings."),
  preferredGenres: z.array(z.string()).describe("A list of genres the user explicitly prefers."),
});
export type PersonalizeMovieRecommendationsInput = z.infer<typeof PersonalizeMovieRecommendationsInputSchema>;

// Output Schema
const PersonalizeMovieRecommendationsOutputSchema = z.object({
  recommendations: z.array(z.object({
    title: z.string().describe("The title of the recommended movie or show."),
    year: z.string().describe("The release year of the recommended content."),
    genre: z.string().describe("The primary genre of the recommended content."),
    description: z.string().describe("A brief description or synopsis of the recommended content."),
  })).describe("A list of personalized movie and show recommendations."),
});
export type PersonalizeMovieRecommendationsOutput = z.infer<typeof PersonalizeMovieRecommendationsOutputSchema>;

// Wrapper function
export async function personalizeMovieRecommendations(input: PersonalizeMovieRecommendationsInput): Promise<PersonalizeMovieRecommendationsOutput> {
  return personalizeMovieRecommendationsFlow(input);
}

// Prompt definition
const prompt = ai.definePrompt({
  name: 'personalizedMovieRecommendationsPrompt',
  input: {schema: PersonalizeMovieRecommendationsInputSchema},
  output: {schema: PersonalizeMovieRecommendationsOutputSchema},
  prompt: `You are an expert movie and show recommendation engine for a social app called Cinephilers.
Your goal is to provide personalized recommendations based on a user's viewing history and stated preferences.

Here is the user's information:
User ID: {{{userId}}}
Watched History:
{{#if watchedHistory}}
  {{#each watchedHistory}}
  - Title: "{{{title}}}", Genre: "{{{genre}}}"{{#if rating}}, Rating: {{rating}}{{/if}}
  {{/each}}
{{else}}
  No watch history available.
{{/if}}

Preferred Genres:
{{#if preferredGenres}}
  {{#each preferredGenres}}
  - {{{this}}}
  {{/each}}
{{else}}
  No explicit genre preferences provided.
{{/if}}

Based on the provided information, recommend 5 movies or shows that the user has NOT already watched.
Focus on content that aligns with their watched history and preferred genres.
For each recommendation, provide the title, release year, primary genre, and a brief description.
Ensure the recommendations are diverse but still tailored to the user's tastes.
Strictly output a JSON array of objects, following the output schema, with no additional text or formatting.`,
});

// Flow definition
const personalizeMovieRecommendationsFlow = ai.defineFlow(
  {
    name: 'personalizedMovieRecommendationsFlow',
    inputSchema: PersonalizeMovieRecommendationsInputSchema,
    outputSchema: PersonalizeMovieRecommendationsOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error('Failed to generate movie recommendations.');
    }
    return output;
  }
);
