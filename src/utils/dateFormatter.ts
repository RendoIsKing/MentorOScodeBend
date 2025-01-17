// @to be improved
export const dateFormatter = (originalDate: Date) => {
  const parsedDate = new Date(originalDate);

  // Set the desired date "2024-06-24"
  parsedDate.setDate(parsedDate.getDate() + 4);

  // Format the date to "yyyy-mm-dd"
  const formattedDate = parsedDate.toISOString().slice(0, 10);

  return formattedDate;
  //   return 1;
};
