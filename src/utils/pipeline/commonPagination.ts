import { PipelineStage } from "mongoose";

export const commonPaginationPipeline = (
  page: number,
  perPage: number,
  //   defaultPerPage: number,
  skip: number
): PipelineStage[] => {
  //   const pipeline: PipelineStage[] =;
  return [
    {
      $facet: {
        metaData: [
          { $count: "total" },
          { $addFields: { page, perPage: perPage } },
          {
            $addFields: {
              pageCount: {
                $ceil: {
                  $divide: ["$total", perPage],
                },
              },
            },
          },
        ],
        data: [{ $skip: skip }, { $limit: perPage }],
      },
    },
  ] as PipelineStage[];
};
