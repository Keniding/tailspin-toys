import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGames,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('filters games by category and publisher', async () => {
        const [strategy] = await db
            .insert(categories)
            .values([
                { name: 'Strategy', description: 'strategy' },
                { name: 'Puzzle', description: 'puzzle' },
            ])
            .returning({ id: categories.id });
        const categoryRows = await db.select().from(categories).orderBy(categories.id);
        await db
            .insert(publishers)
            .values([
                { name: 'Pub One', description: 'publisher one' },
                { name: 'Pub Two', description: 'publisher two' },
            ])
            .returning({ id: publishers.id });
        const publisherRows = await db.select().from(publishers).orderBy(publishers.id);

        await db.insert(games).values([
            { title: 'Alpha', description: 'alpha', starRating: 4, categoryId: categoryRows[0].id, publisherId: publisherRows[0].id },
            { title: 'Beta', description: 'beta', starRating: 4, categoryId: categoryRows[1].id, publisherId: publisherRows[0].id },
            { title: 'Gamma', description: 'gamma', starRating: 4, categoryId: categoryRows[1].id, publisherId: publisherRows[1].id },
        ]);

        const strategyGames = await getGames(db, { categoryIds: [strategy.id] });
        expect(strategyGames.map((game) => game.title)).toEqual(['Alpha']);

        const multipleCategoryGames = await getGames(db, {
            categoryIds: [categoryRows[0].id, categoryRows[1].id],
        });
        expect(multipleCategoryGames.map((game) => game.title)).toEqual(['Alpha', 'Beta', 'Gamma']);

        const combinedGames = await getGames(db, {
            categoryIds: [categoryRows[1].id],
            publisherId: publisherRows[0].id,
        });
        expect(combinedGames.map((game) => game.title)).toEqual(['Beta']);
    });

    it('returns no games when filters do not match', async () => {
        await seedGames(db, 2);
        const games = await getGames(db, { publisherId: 99999 });
        expect(games).toEqual([]);
    });
});
