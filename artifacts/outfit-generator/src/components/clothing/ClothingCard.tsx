import React from "react";
import { type ClothingItem } from "@/hooks/useLocalDB";
import { getImageUrl } from "@/lib/utils";

interface ClothingCardProps {
  item: ClothingItem;
  onClick: () => void;
}

export function ClothingCard({ item, onClick }: ClothingCardProps) {
  return (
    <button 
      onClick={onClick}
      className="card-brutalist relative overflow-hidden group text-left w-full hover:-translate-y-1 hover:shadow-lg focus:translate-y-0 focus:shadow-md"
    >
      <div className="aspect-[3/4] bg-muted w-full relative">
        {item.imageObjectPath ? (
          <img 
            src={getImageUrl(item.imageObjectPath)!} 
            alt={item.name} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-secondary/30 flex items-center justify-center p-4">
            <span className="font-display font-bold text-center opacity-50 uppercase">{item.name}</span>
          </div>
        )}
      </div>
      <div className="p-3 bg-white border-t-2 border-black flex flex-col gap-1">
        <span className="font-bold text-sm truncate uppercase tracking-tight">{item.name}</span>
        <span className="text-[10px] font-bold text-muted-foreground uppercase bg-muted px-2 py-0.5 self-start border border-black">{item.category}</span>
      </div>
      {item.isFavorite && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-primary border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center">
          <span className="text-black text-[10px]">★</span>
        </div>
      )}
    </button>
  );
}
