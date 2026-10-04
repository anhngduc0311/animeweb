import express from 'express';
import { SeoController } from '../controllers/seo.controller.js';

export const seoRouter = express.Router();

seoRouter.get('/robots.txt', SeoController.getRobots);
seoRouter.get('/sitemap.xml', SeoController.getSitemapIndex);
seoRouter.get('/sitemap-main.xml', SeoController.getMainSitemap);
seoRouter.get('/sitemap-genres.xml', SeoController.getGenresSitemap);
seoRouter.get('/sitemap-anime.xml', SeoController.getAnimeSitemap);
