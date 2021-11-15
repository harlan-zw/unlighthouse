import Sitemapper from "sitemapper";

export const extractSitemapRoutes = async (site: string) => {
    const sitemap = new Sitemapper({
        timeout: 15000, // 15 seconds
    });

    const { sites } = await sitemap.fetch(site + '/sitemap.xml');
    return sites
}
